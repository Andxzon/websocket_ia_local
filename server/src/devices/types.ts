export interface DeviceInfo {
  device_id: string;
  name: string;
  model: string;
  status: 'online' | 'offline';
  last_seen: string;
  connected_at: string | null;
}
