import { Router, Request, Response } from 'express';

const router = Router();

const ADMIN_PANEL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LocalAI Bridge — Admin Panel</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #242734;
      --border: #2e3140;
      --text: #e4e6ed;
      --text-dim: #8b8fa3;
      --accent: #6c5ce7;
      --accent2: #a29bfe;
      --green: #00d68f;
      --green-bg: rgba(0, 214, 143, 0.1);
      --red: #ff6b6b;
      --red-bg: rgba(255, 107, 107, 0.1);
      --yellow: #ffc107;
      --yellow-bg: rgba(255, 193, 7, 0.1);
      --radius: 12px;
      --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    /* Auth Screen */
    #auth-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }

    .auth-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 40px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }

    .auth-card h1 {
      font-size: 24px;
      margin-bottom: 8px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .auth-card p { color: var(--text-dim); margin-bottom: 24px; font-size: 14px; }

    /* Main App */
    #app { display: none; }

    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    header h1 {
      font-size: 20px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .header-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-dim);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .status-dot.online { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .status-dot.offline { background: var(--red); }

    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    @media (max-width: 768px) {
      main { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
    }

    .card-full { grid-column: 1 / -1; }

    .card h2 {
      font-size: 16px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card h2 .emoji { font-size: 18px; }

    /* Stats */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
    }

    .stat-item {
      background: var(--surface2);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--accent2);
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Device List */
    .device-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--surface2);
      border-radius: 8px;
      margin-bottom: 8px;
    }

    .device-info { flex: 1; }
    .device-name { font-weight: 600; font-size: 14px; }
    .device-meta { font-size: 12px; color: var(--text-dim); margin-top: 2px; }

    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 20px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge-online { background: var(--green-bg); color: var(--green); }
    .badge-offline { background: var(--red-bg); color: var(--red); }

    /* API Keys */
    .key-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--surface2);
      border-radius: 8px;
      margin-bottom: 8px;
    }

    .key-info { flex: 1; }
    .key-name { font-weight: 600; font-size: 14px; }
    .key-prefix { font-size: 12px; color: var(--text-dim); font-family: monospace; }

    .badge-active { background: var(--green-bg); color: var(--green); }
    .badge-revoked { background: var(--red-bg); color: var(--red); }

    /* Buttons */
    .btn {
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
      font-family: var(--font);
    }

    .btn-primary {
      background: var(--accent);
      color: white;
    }

    .btn-primary:hover { background: var(--accent2); }

    .btn-danger {
      background: var(--red-bg);
      color: var(--red);
      border: 1px solid rgba(255, 107, 107, 0.2);
    }

    .btn-danger:hover { background: rgba(255, 107, 107, 0.2); }

    .btn-sm { padding: 4px 10px; font-size: 11px; }

    /* Inputs */
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 10px 14px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 14px;
      font-family: var(--font);
      outline: none;
      transition: border-color 0.2s;
    }

    input:focus { border-color: var(--accent); }

    .input-group {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .input-group input { flex: 1; }

    /* Request Log */
    .log-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .log-table th {
      text-align: left;
      padding: 8px;
      color: var(--text-dim);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
    }

    .log-table td {
      padding: 8px;
      border-bottom: 1px solid var(--border);
    }

    .log-table tr:last-child td { border-bottom: none; }

    .empty-state {
      text-align: center;
      color: var(--text-dim);
      padding: 32px;
      font-size: 14px;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 20px;
      font-size: 14px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    }

    .toast.success { border-color: var(--green); }
    .toast.error { border-color: var(--red); }

    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* Key reveal */
    .key-reveal {
      background: var(--yellow-bg);
      border: 1px solid rgba(255, 193, 7, 0.3);
      border-radius: 8px;
      padding: 12px;
      margin-top: 12px;
      font-size: 13px;
    }

    .key-reveal code {
      font-family: monospace;
      background: var(--surface);
      padding: 2px 6px;
      border-radius: 4px;
      user-select: all;
      word-break: break-all;
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>

<!-- Auth Screen -->
<div id="auth-screen">
  <div class="auth-card">
    <h1>🌉 LocalAI Bridge</h1>
    <p>Enter admin secret to access the dashboard</p>
    <div class="input-group" style="flex-direction: column; gap: 12px;">
      <input type="password" id="admin-secret-input" placeholder="Admin Secret" />
      <button class="btn btn-primary" onclick="authenticate()" style="width: 100%; padding: 12px;">Sign In</button>
    </div>
    <p id="auth-error" style="color: var(--red); margin-top: 12px; display: none;">Invalid admin secret.</p>
  </div>
</div>

<!-- Main App -->
<div id="app">
  <header>
    <h1>🌉 LocalAI Bridge</h1>
    <div class="header-status">
      <span class="status-dot" id="server-status-dot"></span>
      <span id="server-status-text">Connecting...</span>
    </div>
  </header>

  <main>
    <!-- Stats Card -->
    <div class="card card-full">
      <h2><span class="emoji">📊</span> Overview</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value" id="stat-devices">0</div>
          <div class="stat-label">Online Devices</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="stat-requests">0</div>
          <div class="stat-label">Requests Today</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="stat-latency">0ms</div>
          <div class="stat-label">Avg Latency</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="stat-errors">0</div>
          <div class="stat-label">Errors Today</div>
        </div>
      </div>
    </div>

    <!-- Devices Card -->
    <div class="card">
      <h2><span class="emoji">📱</span> Devices</h2>
      <div id="devices-list">
        <div class="empty-state">No devices registered yet.</div>
      </div>
    </div>

    <!-- API Keys Card -->
    <div class="card">
      <h2><span class="emoji">🔑</span> API Keys</h2>
      <div class="input-group">
        <input type="text" id="new-key-name" placeholder="Key name (e.g. my-app)" />
        <input type="text" id="new-key-value" placeholder="Custom key (optional)" />
        <button class="btn btn-primary" onclick="createKey()">Create</button>
      </div>
      <div id="key-reveal" class="key-reveal" style="display: none;"></div>
      <div id="keys-list">
        <div class="empty-state">No API keys yet.</div>
      </div>
    </div>

    <!-- Recent Requests -->
    <div class="card card-full">
      <h2><span class="emoji">📋</span> Recent Requests</h2>
      <div style="overflow-x: auto;">
        <table class="log-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Model</th>
              <th>Device</th>
              <th>Latency</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody id="requests-tbody">
            <tr><td colspan="5" class="empty-state">No requests yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>
</div>

<script>
  let adminSecret = sessionStorage.getItem('adminSecret') || '';
  let refreshInterval = null;

  if (adminSecret) {
    verifyAndShow();
  }

  document.getElementById('admin-secret-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authenticate();
  });

  async function authenticate() {
    adminSecret = document.getElementById('admin-secret-input').value.trim();
    if (!adminSecret) return;
    await verifyAndShow();
  }

  async function verifyAndShow() {
    try {
      const res = await apiFetch('/admin/stats');
      if (res.ok) {
        sessionStorage.setItem('adminSecret', adminSecret);
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        refreshAll();
        refreshInterval = setInterval(refreshAll, 5000);
      } else {
        document.getElementById('auth-error').style.display = 'block';
        sessionStorage.removeItem('adminSecret');
      }
    } catch (err) {
      document.getElementById('auth-error').style.display = 'block';
    }
  }

  function apiFetch(path, options = {}) {
    const baseUrl = window.location.origin;
    return fetch(baseUrl + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': adminSecret,
        ...(options.headers || {}),
      },
    });
  }

  async function refreshAll() {
    await Promise.all([refreshStats(), refreshDevices(), refreshKeys()]);
  }

  async function refreshStats() {
    try {
      const res = await apiFetch('/admin/stats');
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('stat-devices').textContent = data.online_devices;
      document.getElementById('stat-requests').textContent = data.requests_today;
      document.getElementById('stat-latency').textContent = data.avg_latency_ms + 'ms';
      document.getElementById('stat-errors').textContent = data.errors_today;

      const dot = document.getElementById('server-status-dot');
      const text = document.getElementById('server-status-text');
      dot.className = 'status-dot online';
      text.textContent = data.online_devices + ' device(s) online';

      const tbody = document.getElementById('requests-tbody');
      if (data.recent_requests && data.recent_requests.length > 0) {
        tbody.innerHTML = data.recent_requests.map(r =>
          '<tr>' +
          '<td><span class="badge ' + (r.status === 'completed' ? 'badge-active' : 'badge-revoked') + '">' + r.status + '</span></td>' +
          '<td>' + escHtml(r.model) + '</td>' +
          '<td>' + escHtml(r.device_id || '—') + '</td>' +
          '<td>' + (r.latency_ms != null ? r.latency_ms + 'ms' : '—') + '</td>' +
          '<td>' + timeAgo(r.created_at) + '</td>' +
          '</tr>'
        ).join('');
      }
    } catch (err) {
      document.getElementById('server-status-dot').className = 'status-dot offline';
      document.getElementById('server-status-text').textContent = 'Connection error';
    }
  }

  async function refreshDevices() {
    try {
      const res = await apiFetch('/admin/devices');
      if (!res.ok) return;
      const data = await res.json();

      const container = document.getElementById('devices-list');
      if (!data.data || data.data.length === 0) {
        container.innerHTML = '<div class="empty-state">No devices registered yet.</div>';
        return;
      }

      container.innerHTML = data.data.map(d =>
        '<div class="device-item">' +
        '<span class="status-dot ' + (d.status === 'online' ? 'online' : 'offline') + '"></span>' +
        '<div class="device-info">' +
        '<div class="device-name">' + escHtml(d.device_id) + '</div>' +
        '<div class="device-meta">' + escHtml(d.name) + ' · ' + escHtml(d.model) + ' · Last seen: ' + (d.last_seen ? timeAgo(d.last_seen) : 'never') + '</div>' +
        '</div>' +
        '<span class="badge ' + (d.status === 'online' ? 'badge-online' : 'badge-offline') + '">' + d.status + '</span>' +
        '</div>'
      ).join('');
    } catch (err) {}
  }

  async function refreshKeys() {
    try {
      const res = await apiFetch('/admin/api-keys');
      if (!res.ok) return;
      const data = await res.json();

      const container = document.getElementById('keys-list');
      if (!data.data || data.data.length === 0) {
        container.innerHTML = '<div class="empty-state">No API keys yet.</div>';
        return;
      }

      container.innerHTML = data.data.map(k =>
        '<div class="key-item">' +
        '<div class="key-info">' +
        '<div class="key-name">' + escHtml(k.name) + '</div>' +
        '<div class="key-prefix">' + escHtml(k.key_prefix) + '••••••</div>' +
        '</div>' +
        '<span class="badge ' + (k.active ? 'badge-active' : 'badge-revoked') + '">' + (k.active ? 'active' : 'revoked') + '</span>' +
        (k.active ? '<button class="btn btn-danger btn-sm" onclick="deleteKey(\\'' + k.id + '\\')">Delete</button>' : '') +
        '</div>'
      ).join('');
    } catch (err) {}
  }

  async function createKey() {
    const name = document.getElementById('new-key-name').value.trim();
    const customKey = document.getElementById('new-key-value').value.trim();

    if (!name) {
      showToast('Please enter a key name.', 'error');
      return;
    }

    try {
      const body = { name };
      if (customKey) body.key = customKey;

      const res = await apiFetch('/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        showToast('Failed to create API key.', 'error');
        return;
      }

      const data = await res.json();

      const reveal = document.getElementById('key-reveal');
      reveal.style.display = 'block';
      reveal.innerHTML = '⚠️ Save this key now — it won\\'t be shown again:<br><br><code>' + escHtml(data.key) + '</code>';

      document.getElementById('new-key-name').value = '';
      document.getElementById('new-key-value').value = '';

      showToast('API key created!', 'success');
      refreshKeys();

      setTimeout(() => { reveal.style.display = 'none'; }, 30000);
    } catch (err) {
      showToast('Error creating key.', 'error');
    }
  }

  async function deleteKey(id) {
    if (!confirm('Delete this API key? This cannot be undone.')) return;

    try {
      const res = await apiFetch('/admin/api-keys/' + id, { method: 'DELETE' });
      if (res.ok) {
        showToast('API key deleted.', 'success');
        refreshKeys();
      } else {
        showToast('Failed to delete key.', 'error');
      }
    } catch (err) {
      showToast('Error deleting key.', 'error');
    }
  }

  function showToast(message, type) {
    type = type || 'success';
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return seconds + 's ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days + 'd ago';
  }
</script>

</body>
</html>`;

/**
 * GET /panel
 * Serves the admin panel HTML inline — no file system dependency.
 */
router.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(ADMIN_PANEL_HTML);
});

export default router;
