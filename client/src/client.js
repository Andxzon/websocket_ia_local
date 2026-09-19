#!/usr/bin/env node

/**
 * LocalAI Bridge — Termux Client
 *
 * Connects to the LocalAI Bridge server via WebSocket and forwards
 * incoming requests to the local llama-server.
 *
 * Usage:
 *   npm start
 *
 * Environment variables (see .env.example):
 *   SERVER_URL       - WebSocket URL of the bridge server
 *   DEVICE_ID        - Unique identifier for this device
 *   DEVICE_NAME      - Human-readable device name
 *   DEVICE_MODEL     - Model name (e.g. "qwen")
 *   DEVICE_TOKEN     - Authentication token (must match server's DEVICE_SECRET)
 *   LLAMA_SERVER_URL - Local llama-server URL (default: http://127.0.0.1:8080)
 */

const dotenv = require('dotenv');
const path = require('path');
const VoiceSession = require('./voice/VoiceSession');

// Load .env from client directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const WebSocket = require('ws');
const http = require('http');
const https = require('https');

// ============ Configuration ============

const CONFIG = {
  serverUrl: process.env.SERVER_URL || 'ws://localhost:3000/device',
  deviceId: process.env.DEVICE_ID || 'android-default',
  deviceName: process.env.DEVICE_NAME || 'Local Device',
  deviceModel: process.env.DEVICE_MODEL || 'qwen',
  deviceToken: process.env.DEVICE_TOKEN || '',
  llamaServerUrl: process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8080',
};

// Reconnection settings
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;
let reconnectDelay = RECONNECT_BASE_MS;
let reconnectTimer = null;
let ws = null;
let isConnected = false;
let activeRequests = 0;

// ============ Logging ============

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.error(`[${ts}] ❌ ${msg}`);
}

// ============ Llama Server Health Check ============

async function checkLlamaServer() {
  try {
    const url = new URL('/health', CONFIG.llamaServerUrl);
    const res = await httpGet(url.toString());
    return res.statusCode === 200;
  } catch {
    // Try a simple GET to root
    try {
      const res = await httpGet(CONFIG.llamaServerUrl);
      return res.statusCode < 500;
    } catch {
      return false;
    }
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 5000 }, (res) => {
      res.resume(); // consume body
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ============ Forward Request to Llama Server ============

async function forwardToLlama(requestId, payload) {
  const { model, messages, stream, temperature, top_p, max_tokens, stop, frequency_penalty, presence_penalty } = payload;

  // Build llama-server compatible request body
  const body = { messages, stream: !!stream };

  // Forward optional parameters
  if (temperature !== undefined) body.temperature = temperature;
  if (top_p !== undefined) body.top_p = top_p;
  if (max_tokens !== undefined) body.n_predict = max_tokens; // llama.cpp uses n_predict
  if (stop !== undefined) body.stop = Array.isArray(stop) ? stop : [stop];
  if (frequency_penalty !== undefined) body.frequency_penalty = frequency_penalty;
  if (presence_penalty !== undefined) body.presence_penalty = presence_penalty;

  const jsonBody = JSON.stringify(body);
  const url = new URL('/v1/chat/completions', CONFIG.llamaServerUrl);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonBody),
    },
    timeout: 120000,
  };

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      if (stream) {
        // === STREAMING ===
        handleStreamResponse(requestId, res);
        resolve(null); // Response handled via streaming
      } else {
        // === NON-STREAMING ===
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Invalid JSON from llama-server: ${data.substring(0, 200)}`));
          }
        });
      }
    });

    req.on('error', (err) => {
      reject(new Error(`llama-server request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('llama-server request timed out'));
    });

    req.write(jsonBody);
    req.end();
  });
}

// ============ Handle Streaming Response ============

function handleStreamResponse(requestId, res) {
  let buffer = '';

  res.on('data', (chunk) => {
    buffer += chunk.toString();

    // Parse SSE lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue; // Skip empty/comment lines

      if (trimmed === 'data: [DONE]') {
        // Stream complete
        sendMessage({
          type: 'stream_end',
          request_id: requestId,
        });
        activeRequests--;
        return;
      }

      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.substring(6);
        try {
          const parsed = JSON.parse(jsonStr);
          sendMessage({
            type: 'stream_chunk',
            request_id: requestId,
            payload: parsed,
          });
        } catch {
          // Skip invalid JSON chunks
        }
      }
    }
  });

  res.on('end', () => {
    // Process any remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed === 'data: [DONE]') {
        sendMessage({
          type: 'stream_end',
          request_id: requestId,
        });
      } else if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.substring(6));
          sendMessage({
            type: 'stream_chunk',
            request_id: requestId,
            payload: parsed,
          });
        } catch { /* ignore */ }
        sendMessage({
          type: 'stream_end',
          request_id: requestId,
        });
      }
    }
    activeRequests--;
  });

  res.on('error', (err) => {
    logError(`Stream error for ${requestId}: ${err.message}`);
    sendMessage({
      type: 'error',
      request_id: requestId,
      error: { message: `Stream error: ${err.message}`, code: 'stream_error' },
    });
    activeRequests--;
  });
}

// ============ WebSocket Connection ============

function sendMessage(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function connect() {
  // Build URL with token
  const separator = CONFIG.serverUrl.includes('?') ? '&' : '?';
  const url = `${CONFIG.serverUrl}${separator}token=${encodeURIComponent(CONFIG.deviceToken)}`;

  log(`Connecting to ${CONFIG.serverUrl}...`);

  ws = new WebSocket(url, {
    headers: { 'User-Agent': 'LocalAI-Bridge-Client/1.0' },
    handshakeTimeout: 10000,
  });

  ws.on('open', () => {
    isConnected = true;
    reconnectDelay = RECONNECT_BASE_MS; // Reset backoff

    log('Connected ✓');

    // Register device
    sendMessage({
      type: 'register',
      device_id: CONFIG.deviceId,
      name: CONFIG.deviceName,
      model: CONFIG.deviceModel,
    });
  });

  ws.on('message', async (data, isBinary) => {
    if (isBinary) {
      // Route binary audio to VoiceSession
      VoiceSession.getInstance(ws, CONFIG.llamaServerUrl).handleBinary(data);
      return;
    }

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      logError('Invalid JSON received from server.');
      return;
    }

    if (message.type && message.type.startsWith('voice.')) {
      VoiceSession.getInstance(ws, CONFIG.llamaServerUrl).handleCommand(message);
      return;
    }

    switch (message.type) {
      case 'registered':
        log(`Registered as: ${message.device_id}`);
        log('');
        log('Waiting for requests...');
        log('');

        // Check llama-server health
        const healthy = await checkLlamaServer();
        if (healthy) {
          log(`llama-server: ✅ ONLINE (${CONFIG.llamaServerUrl})`);
        } else {
          logError(`llama-server: ❌ OFFLINE (${CONFIG.llamaServerUrl})`);
          log('  Requests will fail until llama-server is available.');
        }
        log('');
        break;

      case 'ping':
        sendMessage({ type: 'pong', timestamp: message.timestamp });
        break;

      case 'request':
        await handleRequest(message);
        break;

      default:
        log(`Unknown message type: ${message.type}`);
    }
  });

  ws.on('close', (code, reason) => {
    isConnected = false;
    const reasonStr = reason ? reason.toString() : '';

    if (code === 4001) {
      logError('Connection rejected: Invalid device token.');
      logError('Check your DEVICE_TOKEN matches the server\'s DEVICE_SECRET.');
      process.exit(1);
    }

    log(`Connection lost (code: ${code}${reasonStr ? ', reason: ' + reasonStr : ''}).`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    logError(`WebSocket error: ${err.message}`);
  });
}

// ============ Handle Incoming Request ============

async function handleRequest(message) {
  const { request_id, payload } = message;

  if (!request_id || !payload) {
    logError('Invalid request message received.');
    return;
  }

  activeRequests++;
  const modelName = payload.model || CONFIG.deviceModel;
  const isStream = payload.stream;
  const msgCount = payload.messages ? payload.messages.length : 0;

  log(`📨 Request ${request_id.substring(0, 8)}... | model: ${modelName} | messages: ${msgCount} | stream: ${!!isStream}`);

  try {
    const result = await forwardToLlama(request_id, payload);

    // For non-streaming, send the complete response
    if (result !== null) {
      sendMessage({
        type: 'response',
        request_id: request_id,
        payload: result,
      });
      activeRequests--;
      const tokens = result.usage ? ` | tokens: ${result.usage.total_tokens}` : '';
      log(`✅ Response ${request_id.substring(0, 8)}...${tokens}`);
    }
    // For streaming, handleStreamResponse already sends chunks

  } catch (err) {
    logError(`Request ${request_id.substring(0, 8)}... failed: ${err.message}`);
    sendMessage({
      type: 'error',
      request_id: request_id,
      error: {
        message: err.message,
        code: 'llama_server_error',
      },
    });
    activeRequests--;
  }
}

// ============ Reconnection ============

function scheduleReconnect() {
  if (reconnectTimer) return;

  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX_MS);

  log(`Reconnecting in ${Math.round(delay / 1000)} seconds...`);
  log('');

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

// ============ Banner & Start ============

function printBanner() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║     LocalAI Bridge Client v1.0      ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  Device:  ${CONFIG.deviceId}`);
  console.log(`  Name:    ${CONFIG.deviceName}`);
  console.log(`  Model:   ${CONFIG.deviceModel}`);
  console.log(`  Server:  ${CONFIG.serverUrl}`);
  console.log(`  Llama:   ${CONFIG.llamaServerUrl}`);
  console.log('');
}

// Validate config
function validateConfig() {
  if (!CONFIG.deviceToken) {
    logError('DEVICE_TOKEN is required. Set it in .env or as an environment variable.');
    logError('It must match the DEVICE_SECRET configured on the server.');
    process.exit(1);
  }
  if (!CONFIG.deviceId) {
    logError('DEVICE_ID is required.');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('\nShutting down...');
  if (ws) ws.close(1000, 'Client shutdown');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (ws) ws.close(1000, 'Client shutdown');
  process.exit(0);
});

// Start
printBanner();
validateConfig();
connect();
