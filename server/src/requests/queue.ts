import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database';
import { config } from '../config';
import { deviceManager } from '../devices';

interface PendingRequest {
  request_id: string;
  device_id: string;
  api_key_id: string;
  model: string;
  stream: boolean;
  created_at: Date;
  timeoutTimer: NodeJS.Timeout;

  // For non-streaming: resolve/reject the promise
  resolve?: (value: any) => void;
  reject?: (reason: any) => void;

  // For streaming: SSE response object
  sseResponse?: Response;
}

class RequestQueue {
  private pending: Map<string, PendingRequest> = new Map();

  /**
   * Create a new pending request and return a promise that resolves with the response.
   * Used for non-streaming requests.
   */
  createRequest(
    deviceId: string,
    apiKeyId: string,
    model: string
  ): { request_id: string; promise: Promise<any> } {
    const request_id = uuidv4();

    const promise = new Promise<any>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this.timeoutRequest(request_id);
      }, config.requestTimeoutMs);

      const pending: PendingRequest = {
        request_id,
        device_id: deviceId,
        api_key_id: apiKeyId,
        model,
        stream: false,
        created_at: new Date(),
        timeoutTimer,
        resolve,
        reject,
      };

      this.pending.set(request_id, pending);
    });

    // Log request to database (fire and forget)
    this.logRequest(request_id, deviceId, apiKeyId, model).catch(() => {});

    return { request_id, promise };
  }

  /**
   * Create a streaming request that writes SSE chunks to the response.
   */
  createStreamingRequest(
    deviceId: string,
    apiKeyId: string,
    model: string,
    res: Response
  ): string {
    const request_id = uuidv4();

    const timeoutTimer = setTimeout(() => {
      this.timeoutRequest(request_id);
    }, config.requestTimeoutMs);

    const pending: PendingRequest = {
      request_id,
      device_id: deviceId,
      api_key_id: apiKeyId,
      model,
      stream: true,
      created_at: new Date(),
      timeoutTimer,
      sseResponse: res,
    };

    this.pending.set(request_id, pending);

    // Log request to database (fire and forget)
    this.logRequest(request_id, deviceId, apiKeyId, model).catch(() => {});

    return request_id;
  }

  /**
   * Resolve a non-streaming request with the response payload.
   */
  resolveRequest(requestId: string, payload: any, usage?: any): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeoutTimer);
    this.pending.delete(requestId);

    // Release device
    deviceManager.setBusy(pending.device_id, false);

    // Update DB log
    const latencyMs = Date.now() - pending.created_at.getTime();
    this.updateRequestLog(requestId, 'completed', latencyMs, usage).catch(() => {});

    if (pending.resolve) {
      pending.resolve(payload);
    }
  }

  /**
   * Write a streaming chunk to the SSE response.
   */
  writeStreamChunk(requestId: string, chunk: any): void {
    const pending = this.pending.get(requestId);
    if (!pending || !pending.sseResponse) return;

    try {
      if (!pending.sseResponse.writableEnded) {
        pending.sseResponse.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err: any) {
      console.error(`Error writing SSE chunk for ${requestId}:`, err.message);
    }
  }

  /**
   * End a streaming request.
   */
  endStream(requestId: string, usage?: any): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeoutTimer);
    this.pending.delete(requestId);

    // Release device
    deviceManager.setBusy(pending.device_id, false);

    // Update DB log
    const latencyMs = Date.now() - pending.created_at.getTime();
    this.updateRequestLog(requestId, 'completed', latencyMs, usage).catch(() => {});

    if (pending.sseResponse && !pending.sseResponse.writableEnded) {
      try {
        pending.sseResponse.write('data: [DONE]\n\n');
        pending.sseResponse.end();
      } catch (_) { /* ignore */ }
    }
  }

  /**
   * Reject a request with an error.
   */
  rejectRequest(requestId: string, error: { message: string; code: string }): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeoutTimer);
    this.pending.delete(requestId);

    // Release device
    deviceManager.setBusy(pending.device_id, false);

    // Update DB log
    const latencyMs = Date.now() - pending.created_at.getTime();
    this.updateRequestLog(requestId, 'error', latencyMs).catch(() => {});

    if (pending.stream && pending.sseResponse) {
      // For streaming, send error as SSE event and close
      if (!pending.sseResponse.writableEnded) {
        try {
          const errorChunk = {
            error: {
              message: error.message,
              type: 'server_error',
              code: error.code,
            },
          };
          pending.sseResponse.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
          pending.sseResponse.write('data: [DONE]\n\n');
          pending.sseResponse.end();
        } catch (_) { /* ignore */ }
      }
    } else if (pending.reject) {
      pending.reject(error);
    }
  }

  /**
   * Handle request timeout.
   */
  private timeoutRequest(requestId: string): void {
    console.warn(`⏰ Request ${requestId} timed out.`);
    this.rejectRequest(requestId, {
      message: 'Request timed out. The device may be overloaded or disconnected.',
      code: 'request_timeout',
    });
  }

  /**
   * Cancel all pending requests for a device (e.g., on disconnect).
   */
  cancelDeviceRequests(deviceId: string): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.device_id === deviceId) {
        console.warn(`🚫 Cancelling request ${requestId} — device ${deviceId} disconnected.`);
        this.rejectRequest(requestId, {
          message: 'Device disconnected during request processing.',
          code: 'device_disconnected',
        });
      }
    }
  }

  /**
   * Get count of pending requests.
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Log a new request to the database.
   */
  private async logRequest(
    requestId: string,
    deviceId: string,
    apiKeyId: string,
    model: string
  ): Promise<void> {
    await query(
      `INSERT INTO request_logs (request_id, device_id, api_key_id, model, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [requestId, deviceId, apiKeyId, model]
    );
  }

  /**
   * Update a request log entry.
   */
  private async updateRequestLog(
    requestId: string,
    status: string,
    latencyMs: number,
    usage?: any
  ): Promise<void> {
    const tokensIn = usage?.prompt_tokens || null;
    const tokensOut = usage?.completion_tokens || null;

    await query(
      `UPDATE request_logs
       SET status = $1, completed_at = NOW(), latency_ms = $2, tokens_in = $3, tokens_out = $4
       WHERE request_id = $5`,
      [status, latencyMs, tokensIn, tokensOut, requestId]
    );
  }
}

// Singleton
export const requestQueue = new RequestQueue();
