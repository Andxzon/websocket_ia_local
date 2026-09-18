import { IncomingMessage } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { parse as parseUrl } from 'url';
import { config } from '../config';
import { deviceManager } from '../devices';
import { requestQueue } from '../requests';
import {
  DeviceToServerMessage,
  WSPingMessage,
} from './protocol';

/**
 * Create and configure the WebSocket server for device connections.
 */
export function createWebSocketHandler(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let deviceId: string | null = null;
    let registered = false;

    console.log('🔌 New WebSocket connection from:', req.socket.remoteAddress);

    // Authenticate device on connection
    const url = parseUrl(req.url || '', true);
    const token = url.query.token as string;

    if (token !== config.deviceSecret) {
      console.warn('🚫 WebSocket connection rejected — invalid device token.');
      ws.close(4001, 'Invalid device token');
      return;
    }

    // Set up heartbeat
    let heartbeatTimer: NodeJS.Timeout;
    let heartbeatTimeout: NodeJS.Timeout | null = null;

    const startHeartbeat = () => {
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const ping: WSPingMessage = { type: 'ping', timestamp: Date.now() };
          ws.send(JSON.stringify(ping));

          // Expect pong within timeout
          heartbeatTimeout = setTimeout(() => {
            console.warn(`💀 Device ${deviceId || 'unknown'} heartbeat timeout — closing.`);
            ws.terminate();
          }, config.heartbeatTimeoutMs);

          if (deviceId) {
            deviceManager.setHeartbeatTimeout(deviceId, heartbeatTimeout);
          }
        }
      }, config.heartbeatIntervalMs);

      if (deviceId) {
        deviceManager.setHeartbeatTimer(deviceId, heartbeatTimer);
      }
    };

    // Handle messages from device
    ws.on('message', async (data: WebSocket.Data) => {
      let message: DeviceToServerMessage;
      try {
        message = JSON.parse(data.toString());
      } catch {
        console.warn('⚠️  Invalid JSON from device.');
        return;
      }

      switch (message.type) {
        case 'register': {
          deviceId = message.device_id;

          if (!deviceId || !message.name) {
            ws.close(4002, 'Invalid registration data');
            return;
          }

          try {
            await deviceManager.register(ws, deviceId, message.name, message.model || 'qwen');
            registered = true;
            startHeartbeat();

            // Confirm registration
            ws.send(JSON.stringify({
              type: 'registered',
              device_id: deviceId,
              message: 'Successfully registered with LocalAI Bridge.',
            }));
          } catch (err: any) {
            console.error('Error registering device:', err.message);
            ws.close(4003, 'Registration failed');
          }
          break;
        }

        case 'pong': {
          if (deviceId) {
            deviceManager.clearHeartbeatTimeout(deviceId);
            deviceManager.updateLastSeen(deviceId);
          }
          break;
        }

        case 'response': {
          if (!message.request_id) break;
          requestQueue.resolveRequest(
            message.request_id,
            message.payload,
            message.payload?.usage
          );
          break;
        }

        case 'stream_chunk': {
          if (!message.request_id) break;
          requestQueue.writeStreamChunk(message.request_id, message.payload);
          break;
        }

        case 'stream_end': {
          if (!message.request_id) break;
          requestQueue.endStream(message.request_id, message.usage);
          break;
        }

        case 'error': {
          if (!message.request_id) break;
          requestQueue.rejectRequest(message.request_id, {
            message: message.error?.message || 'Device error',
            code: message.error?.code || 'device_error',
          });
          break;
        }

        default: {
          console.warn(`⚠️  Unknown message type from device: ${(message as any).type}`);
        }
      }
    });

    // Handle disconnect
    ws.on('close', async (code, reason) => {
      console.log(`🔌 WebSocket closed: device=${deviceId || 'unregistered'} code=${code}`);

      clearInterval(heartbeatTimer);
      if (heartbeatTimeout) clearTimeout(heartbeatTimeout);

      if (deviceId) {
        // Cancel all pending requests for this device
        requestQueue.cancelDeviceRequests(deviceId);
        await deviceManager.unregister(deviceId);
      }
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error(`WebSocket error for device ${deviceId || 'unknown'}:`, err.message);
    });

    // If device doesn't register within 10 seconds, disconnect
    setTimeout(() => {
      if (!registered) {
        console.warn('⚠️  Device did not register in time — disconnecting.');
        ws.close(4004, 'Registration timeout');
      }
    }, 10000);
  });
}
