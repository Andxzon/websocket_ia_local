# 🌉 LocalAI Bridge

Turn your Android phone running a local LLM (via `llama-server` in Termux) into an internet-accessible AI provider with an **OpenAI-compatible API**.

```
Internet Client → HTTPS API → LocalAI Bridge Server → WebSocket → Android/Termux → llama-server → Qwen
```

## ✨ Features

- **OpenAI-compatible API** — use with any OpenAI SDK or compatible app
- **WebSocket bridge** — phone connects *outbound* (no port forwarding needed)
- **Streaming support** — real-time Server-Sent Events (SSE)
- **API key authentication** — bcrypt-hashed keys
- **Multi-device ready** — architecture supports multiple phones
- **Admin panel** — web dashboard to manage devices and keys
- **Docker support** — one command to deploy
- **Auto-reconnection** — client reconnects with exponential backoff
- **Heartbeat/ping-pong** — detects disconnected devices
- **Rate limiting** — protects against abuse
- **Request logging** — metadata only, no conversation content stored

## 📐 Architecture

```
            ┌─────────────────────────┐
            │    LocalAI Bridge       │
            │    (Central Server)     │
            │                         │
            │  POST /v1/chat/...  ←── Client App (OpenAI SDK)
            │                         │
            │  WebSocket /device  ←── Phone (outbound connection)
            │                         │
            │  GET /panel         ←── Admin Dashboard
            └────────────┬────────────┘
                         │
                  WebSocket (persistent)
                         │
                         ▼
                   📱 Android
            ┌─────────────────────────┐
            │        Termux           │
            │   LocalAI Bridge Client │
            │         ↓               │
            │   HTTP localhost:8080   │
            │         ↓               │
            │     llama-server        │
            │         ↓               │
            │        Qwen             │
            └─────────────────────────┘
```

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd localai-bridge
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your secrets:

```env
PORT=3000
DATABASE_URL=postgresql://localai:localai_secret@localhost:5432/localai_bridge
POSTGRES_DB=localai_bridge
POSTGRES_USER=localai
POSTGRES_PASSWORD=localai_secret

JWT_SECRET=your-random-jwt-secret-here
ADMIN_SECRET=your-admin-password-here
DEVICE_SECRET=your-device-password-here

CORS_ORIGINS=*
```

> ⚠️ **Change all secrets** before deploying to production!

### 3. Deploy with Docker

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on port 5432
- **API server** on port 3000

### 4. Verify server is running

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-09-18T14:00:00.000Z",
  "online_devices": 0,
  "pending_requests": 0
}
```

### 5. Open admin panel

Open in your browser: `http://localhost:3000/panel`

Enter your `ADMIN_SECRET` to log in.

The default API key `andxzon` is created automatically on first start.

---

## 📱 Termux Client Setup

### Prerequisites

- [Termux](https://f-droid.org/en/packages/com.termux/) installed
- Node.js installed in Termux: `pkg install nodejs-lts`
- `llama-server` running (e.g., `./llama-server -m model.gguf -c 2048`)

### Install

```bash
# Copy client/ folder to your phone, or clone the repo
cd client
npm install
```

### Configure

```bash
cp .env.example .env
nano .env
```

Edit `.env`:

```env
SERVER_URL=wss://your-server-domain.com/device
DEVICE_ID=android-s22
DEVICE_NAME=Mi teléfono
DEVICE_MODEL=qwen
DEVICE_TOKEN=your-device-password-here
LLAMA_SERVER_URL=http://127.0.0.1:8080
```

> `DEVICE_TOKEN` must match the `DEVICE_SECRET` on the server.

### Run

```bash
npm start
```

Expected output:

```
╔══════════════════════════════════════╗
║     LocalAI Bridge Client v1.0      ║
╚══════════════════════════════════════╝

  Device:  android-s22
  Name:    Mi teléfono
  Model:   qwen
  Server:  wss://your-server-domain.com/device
  Llama:   http://127.0.0.1:8080

[10:30:00] Connecting to wss://your-server-domain.com/device...
[10:30:01] Connected ✓
[10:30:01] Registered as: android-s22

Waiting for requests...

[10:30:01] llama-server: ✅ ONLINE (http://127.0.0.1:8080)
```

---

## 🔌 API Usage

### Using OpenAI SDK (JavaScript/TypeScript)

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://your-server-domain.com/v1',
  apiKey: 'andxzon',
});

// Non-streaming
const response = await client.chat.completions.create({
  model: 'qwen',
  messages: [
    { role: 'user', content: 'Hola, ¿cómo estás?' }
  ],
});

console.log(response.choices[0].message.content);
```

### Streaming

```javascript
const stream = await client.chat.completions.create({
  model: 'qwen',
  messages: [
    { role: 'user', content: 'Escribe un haiku sobre programación' }
  ],
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  process.stdout.write(content);
}
```

### Using cURL

```bash
# Non-streaming
curl https://your-server-domain.com/v1/chat/completions \
  -H "Authorization: Bearer andxzon" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "Hola"}]
  }'

# Streaming
curl https://your-server-domain.com/v1/chat/completions \
  -H "Authorization: Bearer andxzon" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "Hola"}],
    "stream": true
  }'

# List models
curl https://your-server-domain.com/v1/models \
  -H "Authorization: Bearer andxzon"
```

### Using Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-server-domain.com/v1",
    api_key="andxzon"
)

response = client.chat.completions.create(
    model="qwen",
    messages=[
        {"role": "user", "content": "Hola"}
    ]
)

print(response.choices[0].message.content)
```

---

## 🔑 API Key Management

### Create an API key

```bash
curl -X POST http://localhost:3000/admin/api-keys \
  -H "X-Admin-Secret: your-admin-secret" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}'
```

### Create with custom key value

```bash
curl -X POST http://localhost:3000/admin/api-keys \
  -H "X-Admin-Secret: your-admin-secret" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-custom-key", "key": "my-custom-api-key-value"}'
```

### List API keys

```bash
curl http://localhost:3000/admin/api-keys \
  -H "X-Admin-Secret: your-admin-secret"
```

### Delete an API key

```bash
curl -X DELETE http://localhost:3000/admin/api-keys/<key-id> \
  -H "X-Admin-Secret: your-admin-secret"
```

---

## 📊 Admin Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/v1/chat/completions` | POST | API Key | Chat completions (OpenAI-compatible) |
| `/v1/models` | GET | API Key | List available models |
| `/health` | GET | None | Health check |
| `/panel` | GET | None | Admin dashboard (HTML) |
| `/admin/api-keys` | GET | Admin | List API keys |
| `/admin/api-keys` | POST | Admin | Create API key |
| `/admin/api-keys/:id` | DELETE | Admin | Delete API key |
| `/admin/devices` | GET | Admin | List devices |
| `/admin/stats` | GET | Admin | Request statistics |
| `/device` | WebSocket | Device Token | Device connection |

---

## 🏗️ Local Development (without Docker)

### Prerequisites

- Node.js 18+
- PostgreSQL running locally

### Server

```bash
cd server
npm install
npm run build
npm start
```

Or with `ts-node` for development:

```bash
cd server
npm install
npm run dev
```

### Client

```bash
cd client
npm install
npm start
```

---

## 🧪 Testing

### 1. Verify server health

```bash
curl http://localhost:3000/health
```

### 2. Check device connection

After starting the client:

```bash
curl http://localhost:3000/admin/devices \
  -H "X-Admin-Secret: your-admin-secret"
```

### 3. Test chat completion

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer andxzon" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "Say hello in 5 words"}],
    "stream": false
  }'
```

### 4. Test streaming

```bash
curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer andxzon" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "Count from 1 to 10"}],
    "stream": true
  }'
```

### 5. Verify phone is processing

Watch the Termux client output. You should see:

```
[10:30:15] 📨 Request a1b2c3d4... | model: qwen | messages: 1 | stream: false
[10:30:18] ✅ Response a1b2c3d4... | tokens: 42
```

---

## 📁 Project Structure

```
localai-bridge/
│
├── server/                     # Central server (Node.js + TypeScript)
│   ├── src/
│   │   ├── api/                # API routes (chat, models, admin, health)
│   │   ├── auth/               # API key management & middleware
│   │   ├── database/           # PostgreSQL connection, schema, migrations
│   │   ├── devices/            # Device manager (tracking WebSocket clients)
│   │   ├── middleware/         # Rate limiting, security, logging
│   │   ├── requests/           # Request queue with timeouts
│   │   ├── websocket/          # WebSocket handler & protocol
│   │   ├── admin/              # Admin panel route
│   │   ├── config.ts           # Environment configuration
│   │   └── index.ts            # Entry point
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── client/                     # Termux client (plain JavaScript)
│   ├── src/
│   │   └── client.js           # WebSocket client
│   ├── package.json
│   └── .env.example
│
├── admin/                      # Admin panel
│   └── index.html              # Dashboard (single-page)
│
├── docker-compose.yml          # Docker Compose (PostgreSQL + API)
├── .env.example                # Environment template
├── .gitignore
└── README.md
```

---

## 🔒 Security Considerations

- **API keys** are stored as bcrypt hashes — plaintext shown only at creation
- **Admin routes** protected by `ADMIN_SECRET` header
- **Device auth** via `DEVICE_SECRET` on WebSocket upgrade
- **Rate limiting** on all API endpoints
- **Body size** limited to 1MB
- **Request timeouts** prevent hanging connections (default: 120s)
- **No proxy** — server only forwards OpenAI-format requests to registered devices
- **No content logging** — prompts and responses are never stored
- **CORS** configurable via environment variable
- **HTTPS** — use a reverse proxy (nginx, Caddy) for TLS in production

### Production Deployment

For HTTPS in production, put a reverse proxy in front:

```nginx
# nginx example
server {
    listen 443 ssl;
    server_name api.midominio.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
```

---

## ⚡ Flow Diagram

```
1. Client sends POST /v1/chat/completions with API key
2. Server validates API key (bcrypt compare)
3. Server finds an available device (WebSocket connected)
4. Server creates request_id and sends payload via WebSocket
5. Termux client receives request
6. Termux client forwards to llama-server (localhost:8080)
7. llama-server processes with Qwen model
8. Termux client sends response back via WebSocket
9. Server forwards response to the HTTP client
10. Client receives OpenAI-compatible JSON response
```

---

## 📜 License

MIT
