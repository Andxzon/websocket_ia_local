/**
 * WebSocket Protocol — Message types between server and device clients.
 */

// ============ Server → Device Messages ============

export interface WSRequestMessage {
  type: 'request';
  request_id: string;
  payload: {
    model: string;
    messages: Array<{
      role: string;
      content: string;
    }>;
    stream: boolean;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stop?: string | string[];
    frequency_penalty?: number;
    presence_penalty?: number;
  };
}

export interface WSPingMessage {
  type: 'ping';
  timestamp: number;
}

// ============ Device → Server Messages ============

export interface WSRegisterMessage {
  type: 'register';
  device_id: string;
  name: string;
  model: string;
}

export interface WSResponseMessage {
  type: 'response';
  request_id: string;
  payload: any; // OpenAI ChatCompletion format
}

export interface WSStreamChunkMessage {
  type: 'stream_chunk';
  request_id: string;
  payload: any; // OpenAI ChatCompletionChunk format
}

export interface WSStreamEndMessage {
  type: 'stream_end';
  request_id: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface WSErrorMessage {
  type: 'error';
  request_id: string;
  error: {
    message: string;
    code: string;
  };
}

export interface WSPongMessage {
  type: 'pong';
  timestamp: number;
}

// ============ Union Types ============

export type ServerToDeviceMessage = WSRequestMessage | WSPingMessage;

export type DeviceToServerMessage =
  | WSRegisterMessage
  | WSResponseMessage
  | WSStreamChunkMessage
  | WSStreamEndMessage
  | WSErrorMessage
  | WSPongMessage;
