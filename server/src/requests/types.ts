export interface PendingRequestOptions {
  request_id: string;
  device_id: string;
  api_key_id: string;
  model: string;
  stream: boolean;
}

export interface RequestLogEntry {
  id: string;
  request_id: string;
  device_id: string | null;
  api_key_id: string | null;
  model: string;
  status: string;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
  completed_at: string | null;
  latency_ms: number | null;
}
