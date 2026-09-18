import { Router, Request, Response } from 'express';
import { deviceManager } from '../devices';
import { requestQueue } from '../requests';
import { apiKeyAuth } from '../auth';
import { apiRateLimiter } from '../middleware';
import { WSRequestMessage } from '../websocket/protocol';

const router = Router();

/**
 * POST /v1/chat/completions
 * OpenAI-compatible chat completions endpoint.
 */
router.post('/v1/chat/completions', apiKeyAuth, apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { model, messages, stream, temperature, top_p, max_tokens, stop, frequency_penalty, presence_penalty } = req.body;

    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: {
          message: 'Invalid request: "messages" must be a non-empty array.',
          type: 'invalid_request_error',
          code: 'invalid_messages',
        },
      });
      return;
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || typeof msg.content !== 'string') {
        res.status(400).json({
          error: {
            message: 'Invalid message format: each message must have "role" and "content" fields.',
            type: 'invalid_request_error',
            code: 'invalid_message_format',
          },
        });
        return;
      }
    }

    // Find an available device
    const device = deviceManager.getAvailableDevice();
    if (!device) {
      res.status(503).json({
        error: {
          message: 'No devices available to process the request. Please try again later.',
          type: 'server_error',
          code: 'no_device_available',
        },
      });
      return;
    }

    // Mark device as busy
    deviceManager.setBusy(device.device_id, true);

    const isStreaming = stream === true;

    // Build the WebSocket request message
    const wsPayload: WSRequestMessage['payload'] = {
      model: model || device.model,
      messages,
      stream: isStreaming,
    };

    // Forward optional parameters
    if (temperature !== undefined) wsPayload.temperature = temperature;
    if (top_p !== undefined) wsPayload.top_p = top_p;
    if (max_tokens !== undefined) wsPayload.max_tokens = max_tokens;
    if (stop !== undefined) wsPayload.stop = stop;
    if (frequency_penalty !== undefined) wsPayload.frequency_penalty = frequency_penalty;
    if (presence_penalty !== undefined) wsPayload.presence_penalty = presence_penalty;

    if (isStreaming) {
      // === STREAMING MODE ===
      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const requestId = requestQueue.createStreamingRequest(
        device.device_id,
        req.apiKey!.id,
        model || device.model,
        res
      );

      // Send request to device
      const wsMessage: WSRequestMessage = {
        type: 'request',
        request_id: requestId,
        payload: wsPayload,
      };

      device.ws.send(JSON.stringify(wsMessage));

      // Handle client disconnect
      req.on('close', () => {
        // If client disconnects before completion, clean up
        requestQueue.rejectRequest(requestId, {
          message: 'Client disconnected.',
          code: 'client_disconnected',
        });
      });

    } else {
      // === NON-STREAMING MODE ===
      const { request_id, promise } = requestQueue.createRequest(
        device.device_id,
        req.apiKey!.id,
        model || device.model
      );

      // Send request to device
      const wsMessage: WSRequestMessage = {
        type: 'request',
        request_id,
        payload: wsPayload,
      };

      device.ws.send(JSON.stringify(wsMessage));

      try {
        const result = await promise;
        res.json(result);
      } catch (err: any) {
        const statusCode = err.code === 'request_timeout' ? 504 : 502;
        res.status(statusCode).json({
          error: {
            message: err.message || 'Error processing request.',
            type: 'server_error',
            code: err.code || 'processing_error',
          },
        });
      }
    }

  } catch (err: any) {
    console.error('Chat completions error:', err.message);
    res.status(500).json({
      error: {
        message: 'Internal server error.',
        type: 'server_error',
        code: 'internal_error',
      },
    });
  }
});

export default router;
