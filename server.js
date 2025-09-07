require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

const app = express();

// --- Config ---
const PORT = process.env.PORT || 3000;
const MOBIVATE_BASE_URL = process.env.MOBIVATE_BASE_URL || 'https://vortex.mobivatebulksms.com';
const MOBIVATE_API_KEY = process.env.MOBIVATE_API_KEY || '';
const DEFAULT_SENDER   = process.env.MOBIVATE_SENDER || 'WebSender1';
const DEFAULT_ROUTE_ID = process.env.MOBIVATE_ROUTE_ID || '';
const ALLOW_ORIGIN     = process.env.ALLOW_ORIGIN || '*';
const PROXY_API_KEY    = process.env.PROXY_API_KEY || '';

// Credentials (role-based)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const OFFICE_USERNAME = process.env.OFFICE_USERNAME || '';
const OFFICE_PASSWORD = process.env.OFFICE_PASSWORD || '';

if (!MOBIVATE_API_KEY) console.warn('⚠️ MOBIVATE_API_KEY missing');
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) console.warn('⚠️ Admin basic auth not set (ADMIN_USERNAME/ADMIN_PASSWORD)');
if (!OFFICE_USERNAME || !OFFICE_PASSWORD) console.warn('⚠️ Office basic auth not set (OFFICE_USERNAME/OFFICE_PASSWORD)');

// --- Middleware ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(express.json({ limit: '200kb' }));
app.use(cors({ origin: ALLOW_ORIGIN }));
app.set('trust proxy', 1);

// --- Simple JSON storage for credits and logs ---
const DATA_FILE = path.join(__dirname, 'data.json');
function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data.credits !== 'number') data.credits = 0;
    if (!Array.isArray(data.logs)) data.logs = [];
    if (data.dueDate && typeof data.dueDate === 'string') {
      // keep as ISO string
    } else if (data.dueDate !== null && data.dueDate !== undefined) {
      data.dueDate = null;
    }
    return data;
  } catch {
    return { credits: 0, logs: [], dueDate: null };
  }
}
function writeStore(update) {
  const data = { ...readStore(), ...update };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return data;
}
function appendLog(entry) {
  const data = readStore();
  const log = { time: new Date().toISOString(), ...entry };
  data.logs.unshift(log);
  // keep last 1000
  if (data.logs.length > 1000) data.logs.length = 1000;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return log;
}

function computeIsExpired(store) {
  if (!store || !store.dueDate) return false;
  const d = new Date(store.dueDate);
  if (isNaN(d.getTime())) return false;
  // expire at end of the due date (23:59:59.999 UTC equivalent)
  const end = new Date(d.getTime() + (24 * 60 * 60 * 1000) - 1);
  return Date.now() > end.getTime();
}

// 🔒 Header-based auth (page-provided credentials)
// Expect header: x-auth: Basic base64(user:pass)
function requireRoleAuth(role) {
  return function(req, res, next) {
    const hdr = req.headers['x-auth'] || '';
    const [scheme, b64] = String(hdr).split(' ');
    if (scheme === 'Basic' && b64) {
      const creds = Buffer.from(b64, 'base64').toString();
      const i = creds.indexOf(':');
      const user = creds.slice(0, i);
      const pass = creds.slice(i + 1);
      if (role === 'admin' && user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) return next();
      if (role === 'office' && user === OFFICE_USERNAME && pass === OFFICE_PASSWORD) return next();
    }
    return res.status(401).json({ ok:false, error:'Unauthorized' });
  }
}

// Static UI (no browser basic prompt). In-page login will gate actions.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'office.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use('/assets', express.static(path.join(__dirname, 'public')));

// Rate limit: apply only to SMS send endpoints, not admin reads
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ ok:false, error:'Too many requests' })
});
app.use('/api/sms', apiLimiter);

// Optional API key for programmatic access
function requireProxyKey(req, res, next) {
  if (!PROXY_API_KEY) return next();
  const key = req.header('x-api-key');
  if (key !== PROXY_API_KEY) return res.status(401).json({ ok:false, error:'Unauthorized' });
  next();
}

// Helpers
const isNonEmptyString = s => typeof s === 'string' && s.trim().length > 0;
const normalizeMsisdn = input => {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
};

// Health
app.get('/health', (_req, res) => res.json({ ok:true, service:'mobivate-proxy', time:new Date().toISOString() }));

// Send single SMS (Israel format only: 972-XXXXXXXXX)
app.post('/api/sms/send', requireProxyKey, requireRoleAuth('office'), async (req, res) => {
  try {
    // Subscription expiry enforcement
    const storePre = readStore();
    if (computeIsExpired(storePre)) {
      return res.status(402).json({ ok:false, error:'Subscription expired. Please contact the administrator to renew.' });
    }
    const { to, message, sender, routeId } = req.body || {};
    if (!isNonEmptyString(to) || !/^972-?\d{9}$/.test(to)) {
      return res.status(400).json({ ok:false, error:'Phone must be Israel format: 972-XXXXXXXXX or 972XXXXXXXXX' });
    }
    if (!isNonEmptyString(message)) {
      return res.status(400).json({ ok:false, error:'Missing "message".' });
    }
    if (!isNonEmptyString(sender)) {
      return res.status(400).json({ ok:false, error:'Missing "sender".' });
    }
    const recipient = normalizeMsisdn(to);
    if (!recipient) return res.status(400).json({ ok:false, error:'Invalid phone' });

    const originator = sender.trim();

    const payload = {
      originator,
      recipient,   // digits only (no '+')
      body: message,
      routeId: isNonEmptyString(routeId) ? routeId.trim() : (DEFAULT_ROUTE_ID || 'mglobal')
    };

    const r = await axios.post(`${MOBIVATE_BASE_URL}/send/single`, payload, {
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${MOBIVATE_API_KEY}` },
      timeout: 20_000
    });

    res.status(200).json({ ok:true, provider:r.data });
  } catch (e) {
    if (e.response) {
      return res.status(e.response.status || 502).json({
        ok:false,
        error: e.response.data?.error || e.response.data || e.response.statusText || 'Upstream error'
      });
    }
    res.status(502).json({ ok:false, error:e.message || 'Gateway error' });
  }
});

// Batch send with credit deduction
app.post('/api/sms/send-batch', requireProxyKey, requireRoleAuth('office'), async (req, res) => {
  try {
    // Subscription expiry enforcement
    const storePre = readStore();
    if (computeIsExpired(storePre)) {
      return res.status(402).json({ ok:false, error:'Subscription expired. Please contact the administrator to renew.' });
    }
    const { sender, message, recipients, routeId } = req.body || {};
    if (!isNonEmptyString(sender)) return res.status(400).json({ ok:false, error:'Missing sender' });
    if (!isNonEmptyString(message)) return res.status(400).json({ ok:false, error:'Missing message' });

    // Normalize recipients input: string (with commas/newlines) or array
    let list = [];
    if (Array.isArray(recipients)) list = recipients;
    else if (isNonEmptyString(recipients)) list = recipients.split(/[\s,;]+/);
    else return res.status(400).json({ ok:false, error:'Recipients required' });

    const normalized = list
      .map(v => String(v).trim())
      .filter(Boolean)
      .map(v => normalizeMsisdn(v))
      .filter(Boolean);

    // Deduplicate
    const uniqueRecipients = Array.from(new Set(normalized));
    if (uniqueRecipients.length === 0) return res.status(400).json({ ok:false, error:'No valid recipients' });

    // Check credits
    const store = readStore();
    if (store.credits < uniqueRecipients.length) {
      return res.status(402).json({ ok:false, error:'Insufficient credits', needed: uniqueRecipients.length, credits: store.credits });
    }

    // Send sequentially to respect provider rate, collect results
    const results = [];
    let success = 0;
    for (const recipient of uniqueRecipients) {
      const payload = {
        originator: sender.trim(),
        recipient,
        body: message,
        routeId: isNonEmptyString(routeId) ? routeId.trim() : (DEFAULT_ROUTE_ID || 'mglobal')
      };
      try {
        const r = await axios.post(`${MOBIVATE_BASE_URL}/send/single`, payload, {
          headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${MOBIVATE_API_KEY}` },
          timeout: 20_000
        });
        results.push({ recipient, ok:true, provider: r.data });
        success += 1;
      } catch (e) {
        const err = e.response?.data || e.message || 'Upstream error';
        results.push({ recipient, ok:false, error: err });
      }
    }

    // Deduct credits for all attempted messages (1 credit per recipient)
    const after = writeStore({ credits: store.credits - uniqueRecipients.length });
    appendLog({ type:'batch_send', sender, count: uniqueRecipients.length, success, messagePreview: message.slice(0, 40), creditsAfter: after.credits });

    return res.json({ ok:true, attempted: uniqueRecipients.length, success, credits: after.credits, results });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message || 'Server error' });
  }
});

// Admin: get credits
app.get('/api/credits', requireRoleAuth('admin'), (req, res) => {
  const store = readStore();
  res.set('Cache-Control', 'no-store');
  res.json({ ok:true, credits: store.credits });
});

// Admin: subscription info (credits + dueDate)
app.get('/api/subscription', requireRoleAuth('admin'), (req, res) => {
  const store = readStore();
  res.set('Cache-Control', 'no-store');
  res.json({ ok:true, credits: store.credits, dueDate: store.dueDate, isExpired: computeIsExpired(store) });
});
// alias with trailing slash
app.get('/api/subscription/', requireRoleAuth('admin'), (req, res) => {
  const store = readStore();
  res.set('Cache-Control', 'no-store');
  res.json({ ok:true, credits: store.credits, dueDate: store.dueDate, isExpired: computeIsExpired(store) });
});

// Office: get credits (read-only)
app.get('/api/credits/public', requireRoleAuth('office'), (req, res) => {
  const store = readStore();
  res.set('Cache-Control', 'no-store');
  res.json({ ok:true, credits: store.credits });
});

// Office: subscription info (read-only)
app.get('/api/subscription/public', requireRoleAuth('office'), (req, res) => {
  const store = readStore();
  res.set('Cache-Control', 'no-store');
  res.json({ ok:true, credits: store.credits, dueDate: store.dueDate, isExpired: computeIsExpired(store) });
});

// Admin: set credits
app.post('/api/credits/set', requireRoleAuth('admin'), (req, res) => {
  const { credits } = req.body || {};
  const num = Number(credits);
  if (!Number.isFinite(num) || num < 0) return res.status(400).json({ ok:false, error:'credits must be a non-negative number' });
  const after = writeStore({ credits: Math.floor(num) });
  appendLog({ type:'set_credits', creditsAfter: after.credits });
  res.json({ ok:true, credits: after.credits });
});

// Admin: logs (recent)
app.get('/api/logs', requireRoleAuth('admin'), (req, res) => {
  const store = readStore();
  res.json({ ok:true, logs: store.logs.slice(0, 200) });
});

// --- Due date helpers ---
function parseDateInput(val) {
  if (!val) return null;
  // Accept ISO string or yyyy-mm-dd
  const s = String(val).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function addOneMonth(date) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  // handle month rollover
  if (d.getDate() < day) d.setDate(0);
  return d;
}

// Admin: set due date
app.post('/api/due-date/set', requireRoleAuth('admin'), (req, res) => {
  const { dueDate } = req.body || {};
  const d = parseDateInput(dueDate);
  if (!d) return res.status(400).json({ ok:false, error:'Invalid dueDate. Use ISO or yyyy-mm-dd.' });
  const iso = d.toISOString();
  const after = writeStore({ dueDate: iso });
  appendLog({ type:'set_due_date', dueDate: iso });
  res.json({ ok:true, dueDate: after.dueDate });
});

// Admin: renew one month from current due date (or from now if missing)
app.post('/api/due-date/renew-month', requireRoleAuth('admin'), (req, res) => {
  const store = readStore();
  const base = store.dueDate ? new Date(store.dueDate) : new Date();
  if (isNaN(base.getTime())) {
    return res.status(400).json({ ok:false, error:'Stored dueDate is invalid; set it first.' });
  }
  const next = addOneMonth(base);
  const iso = next.toISOString();
  const after = writeStore({ dueDate: iso });
  appendLog({ type:'renew_month', oldDueDate: store.dueDate || null, newDueDate: iso });
  res.json({ ok:true, dueDate: after.dueDate });
});

// Webhook endpoints for Mobivate notifications
app.post('/api/sms/receipt', express.json({ type:'*/*' }), (req, res) => {
  console.log('📨 Delivery Receipt received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.post('/api/sms/incoming', express.json({ type:'*/*' }), (req, res) => {
  console.log('📩 Incoming Message received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.post('/api/sms/click', express.json({ type:'*/*' }), (req, res) => {
  console.log('🔗 URL Click received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// 404
app.use((_req, res) => res.status(404).json({ ok:false, error:'Not found' }));

// Favicon: avoid 404 noise
app.get('/favicon.ico', (_req, res) => res.sendStatus(204));

app.listen(PORT, () => {
  console.log(`✅ Mobivate SMS proxy running on :${PORT}`);
  console.log(`   UI:     http://localhost:${PORT}/  (In-page login)`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});
