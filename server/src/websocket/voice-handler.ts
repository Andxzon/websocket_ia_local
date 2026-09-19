import { IncomingMessage } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { deviceManager } from '../devices';

export function createVoiceWebSocketHandler(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('🎙️ New Voice WebSocket connection from frontend');

    // Currently we just grab the first available device.
    // In a multi-device setup, the client could specify the device_id in the URL or query params.
    const device = deviceManager.getAvailableDevice();

    if (!device) {
      console.warn('🚫 Voice connection rejected — no available device.');
      ws.close(1013, 'No available device');
      return;
    }

    const deviceWs = device.ws;

    console.log(`🎙️ Voice session linked to device ${device.device_id}`);

    // Set device as busy while voice session is active
    deviceManager.setBusy(device.device_id, true);

    // Forward messages from frontend -> device
    ws.on('message', (data: WebSocket.Data, isBinary: boolean) => {
      if (deviceWs.readyState === WebSocket.OPEN) {
        if (isBinary) {
          // It's binary audio data (e.g. Int16 PCM)
          // We can prefix it with a custom byte or just send as is and assume binary = audio
          deviceWs.send(data, { binary: true });
        } else {
          // JSON commands (voice.start, voice.end, voice.interrupt)
          deviceWs.send(data, { binary: false });
        }
      }
    });

    // Create a listener for messages from device -> frontend
    const onDeviceMessage = (data: WebSocket.Data, isBinary: boolean) => {
      if (ws.readyState === WebSocket.OPEN) {
        // Forward back to frontend
        ws.send(data, { binary: isBinary });
      }
    };

    deviceWs.on('message', onDeviceMessage);

    // Cleanup when frontend disconnects
    ws.on('close', () => {
      console.log('🎙️ Voice WebSocket closed by frontend');
      deviceManager.setBusy(device.device_id, false);
      deviceWs.off('message', onDeviceMessage);
      
      // Tell device to stop any ongoing voice processing
      if (deviceWs.readyState === WebSocket.OPEN) {
         deviceWs.send(JSON.stringify({ type: 'voice.interrupt' }));
      }
    });

    ws.on('error', (err) => {
      console.error('Voice WS Error:', err);
    });
  });
}
