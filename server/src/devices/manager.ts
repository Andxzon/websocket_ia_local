import WebSocket from 'ws';
import { query } from '../database';
import { DeviceInfo } from './types';

interface ConnectedDevice {
  ws: WebSocket;
  device_id: string;
  name: string;
  model: string;
  connected_at: Date;
  last_seen: Date;
  busy: boolean; // true when processing a request
  heartbeatTimer?: NodeJS.Timeout;
  heartbeatTimeout?: NodeJS.Timeout;
}

class DeviceManager {
  private devices: Map<string, ConnectedDevice> = new Map();

  /**
   * Register a device connection.
   */
  async register(ws: WebSocket, deviceId: string, name: string, model: string): Promise<void> {
    // If device already connected, close old connection
    const existing = this.devices.get(deviceId);
    if (existing) {
      console.log(`⚠️  Device ${deviceId} reconnecting — closing old connection.`);
      try {
        existing.ws.close(1000, 'Replaced by new connection');
      } catch (_) { /* ignore */ }
      this.clearTimers(deviceId);
    }

    const now = new Date();

    this.devices.set(deviceId, {
      ws,
      device_id: deviceId,
      name,
      model,
      connected_at: now,
      last_seen: now,
      busy: false,
    });

    // Upsert device in database
    await query(
      `INSERT INTO devices (device_id, name, model, status, last_seen, connected_at)
       VALUES ($1, $2, $3, 'online', NOW(), NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         name = $2,
         model = $3,
         status = 'online',
         last_seen = NOW(),
         connected_at = NOW()`,
      [deviceId, name, model]
    );

    console.log(`📱 Device registered: ${deviceId} (${name}) — model: ${model}`);
  }

  /**
   * Unregister a device (on disconnect).
   */
  async unregister(deviceId: string): Promise<void> {
    this.clearTimers(deviceId);
    this.devices.delete(deviceId);

    await query(
      `UPDATE devices SET status = 'offline', last_seen = NOW() WHERE device_id = $1`,
      [deviceId]
    ).catch((err) => {
      console.error(`DB error updating device status for ${deviceId}:`, err.message);
    });

    console.log(`📴 Device disconnected: ${deviceId}`);
  }

  /**
   * Mark device as seen (heartbeat pong received).
   */
  updateLastSeen(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.last_seen = new Date();
    }
  }

  /**
   * Get the first available (online + not busy) device.
   * Extensible: can be changed to round-robin, least-loaded, etc.
   */
  getAvailableDevice(): ConnectedDevice | null {
    for (const device of this.devices.values()) {
      if (device.ws.readyState === WebSocket.OPEN && !device.busy) {
        return device;
      }
    }
    return null;
  }

  /**
   * Get a specific device by ID.
   */
  getDevice(deviceId: string): ConnectedDevice | null {
    return this.devices.get(deviceId) || null;
  }

  /**
   * Mark a device as busy (processing a request).
   */
  setBusy(deviceId: string, busy: boolean): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.busy = busy;
    }
  }

  /**
   * Get info about all connected devices (in-memory).
   */
  getConnectedDevices(): DeviceInfo[] {
    const result: DeviceInfo[] = [];
    for (const device of this.devices.values()) {
      result.push({
        device_id: device.device_id,
        name: device.name,
        model: device.model,
        status: device.ws.readyState === WebSocket.OPEN ? 'online' : 'offline',
        last_seen: device.last_seen.toISOString(),
        connected_at: device.connected_at.toISOString(),
      });
    }
    return result;
  }

  /**
   * Get all devices from database (including offline).
   */
  async getAllDevices(): Promise<DeviceInfo[]> {
    const result = await query<DeviceInfo>(
      `SELECT device_id, name, model, status, last_seen, connected_at
       FROM devices
       ORDER BY last_seen DESC NULLS LAST`
    );

    // Merge with in-memory status (DB might be stale)
    return result.rows.map((row) => {
      const connected = this.devices.get(row.device_id);
      if (connected && connected.ws.readyState === WebSocket.OPEN) {
        return {
          ...row,
          status: 'online' as const,
          last_seen: connected.last_seen.toISOString(),
        };
      }
      return row;
    });
  }

  /**
   * Get list of models available from connected devices.
   */
  getAvailableModels(): string[] {
    const models = new Set<string>();
    for (const device of this.devices.values()) {
      if (device.ws.readyState === WebSocket.OPEN) {
        models.add(device.model);
      }
    }
    return Array.from(models);
  }

  /**
   * Store heartbeat timer reference for cleanup.
   */
  setHeartbeatTimer(deviceId: string, timer: NodeJS.Timeout): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.heartbeatTimer = timer;
    }
  }

  /**
   * Store heartbeat timeout reference for cleanup.
   */
  setHeartbeatTimeout(deviceId: string, timeout: NodeJS.Timeout): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.heartbeatTimeout = timeout;
    }
  }

  /**
   * Clear heartbeat timeout (pong received).
   */
  clearHeartbeatTimeout(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device?.heartbeatTimeout) {
      clearTimeout(device.heartbeatTimeout);
      device.heartbeatTimeout = undefined;
    }
  }

  /**
   * Clear all timers for a device.
   */
  private clearTimers(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      if (device.heartbeatTimer) clearInterval(device.heartbeatTimer);
      if (device.heartbeatTimeout) clearTimeout(device.heartbeatTimeout);
    }
  }

  /**
   * Get count of online devices.
   */
  getOnlineCount(): number {
    let count = 0;
    for (const device of this.devices.values()) {
      if (device.ws.readyState === WebSocket.OPEN) count++;
    }
    return count;
  }
}

// Singleton
export const deviceManager = new DeviceManager();
