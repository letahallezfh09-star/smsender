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
const SMSEEM_BASE_URL = 'https://us-central1-smseem-639c4.cloudfunctions.net';
const SMSEEM_API_KEY = process.env.SMSEEM_API_KEY || '';
const DEFAULT_SENDER   = process.env.SMSEEM_SENDER || 'SMSeem';
const ALLOW_ORIGIN     = process.env.ALLOW_ORIGIN || '*';
const PROXY_API_KEY    = process.env.PROXY_API_KEY || '';

// Credentials (role-based)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const OFFICE_USERNAME = process.env.OFFICE_USERNAME || '';
const OFFICE_PASSWORD = process.env.OFFICE_PASSWORD || '';

// Log configuration status on startup
console.log('🔧 Configuration check:');
if (!SMSEEM_API_KEY) console.warn('⚠️ SMSEEM_API_KEY missing');
else console.log('✅ SMSEEM_API_KEY is set');

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.warn('⚠️ Admin basic auth not set (ADMIN_USERNAME/ADMIN_PASSWORD)');
} else {
  console.log(`✅ Admin auth configured (username: ${ADMIN_USERNAME})`);
}

if (!OFFICE_USERNAME || !OFFICE_PASSWORD) {
  console.warn('⚠️ Office basic auth not set (OFFICE_USERNAME/OFFICE_PASSWORD)');
} else {
  console.log(`✅ Office auth configured (username: ${OFFICE_USERNAME})`);
}

if (!PROXY_API_KEY || PROXY_API_KEY.trim() === '') {
  console.log('ℹ️ PROXY_API_KEY not set - API key check disabled');
} else {
  console.log('✅ PROXY_API_KEY is set - API key check enabled');
}

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
// Allow overriding storage directory via env (useful for Render persistent disks)
const DATA_DIR = process.env.STORAGE_DIR || __dirname;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const DATA_FILE = path.join(DATA_DIR, 'data.json');
function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data.credits !== 'number') data.credits = 0;
    if (!Array.isArray(data.logs)) data.logs = [];
    if (!Array.isArray(data.deliveries)) data.deliveries = [];
    if (!Array.isArray(data.blockedSenders)) data.blockedSenders = [];
    if (data.dueDate && typeof data.dueDate === 'string') {
      // keep as ISO string
    } else if (data.dueDate !== null && data.dueDate !== undefined) {
      data.dueDate = null;
    }
    return data;
  } catch {
    return { credits: 0, logs: [], deliveries: [], blockedSenders: [], dueDate: null };
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

function appendDelivery(entry) {
  const data = readStore();
  const delivery = { time: new Date().toISOString(), ...entry };
  data.deliveries.unshift(delivery);
  // keep last 2000
  if (data.deliveries.length > 2000) data.deliveries.length = 2000;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return delivery;
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
    const hdr = req.headers['x-auth'] || req.headers['X-Auth'] || '';
    
    // Log authentication attempt for debugging
    console.log(`🔐 Auth attempt for role: ${role}, header present: ${!!hdr}`);
    
    if (!hdr) {
      console.log('❌ No x-auth header provided');
      return res.status(401).json({ ok:false, error:'Unauthorized: No credentials provided' });
    }
    
    const [scheme, b64] = String(hdr).split(' ');
    if (scheme !== 'Basic' || !b64) {
      console.log('❌ Invalid auth scheme or missing base64');
      return res.status(401).json({ ok:false, error:'Unauthorized: Invalid credentials format' });
    }
    
    try {
      const creds = Buffer.from(b64, 'base64').toString();
      const i = creds.indexOf(':');
      if (i === -1) {
        console.log('❌ Invalid credentials format (no colon)');
        return res.status(401).json({ ok:false, error:'Unauthorized: Invalid credentials format' });
      }
      
      const user = creds.slice(0, i);
      const pass = creds.slice(i + 1);
      
      // Check credentials
      if (role === 'admin') {
        if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
          console.log('✅ Admin authentication successful');
          return next();
        }
        console.log(`❌ Admin auth failed: user="${user}", expected="${ADMIN_USERNAME}", passMatch=${pass === ADMIN_PASSWORD}`);
      } else if (role === 'office') {
        if (user === OFFICE_USERNAME && pass === OFFICE_PASSWORD) {
          console.log('✅ Office authentication successful');
          return next();
        }
        console.log(`❌ Office auth failed: user="${user}", expected="${OFFICE_USERNAME}", passMatch=${pass === OFFICE_PASSWORD}`);
      }
      
      return res.status(401).json({ ok:false, error:'Unauthorized: Invalid username or password' });
    } catch (e) {
      console.error('❌ Error parsing credentials:', e.message);
      return res.status(401).json({ ok:false, error:'Unauthorized: Error parsing credentials' });
    }
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

// Optional API key for programmatic access (only if PROXY_API_KEY is set)
// If not set, this middleware allows all requests through
function requireProxyKey(req, res, next) {
  // If PROXY_API_KEY is not configured, skip this check
  if (!PROXY_API_KEY || PROXY_API_KEY.trim() === '') {
    return next();
  }
  
  // If PROXY_API_KEY is set, require it in the request
  const key = req.header('x-api-key') || req.header('X-Api-Key');
  if (key === PROXY_API_KEY) {
    return next();
  }
  
  console.log('❌ Proxy API key mismatch or missing');
  return res.status(401).json({ ok:false, error:'Unauthorized: Invalid or missing API key' });
}

// Helpers
const isNonEmptyString = s => typeof s === 'string' && s.trim().length > 0;

// Convert phone number to Israeli format (0501234567)
// Accepts: 972-XXXXXXXXX, 972XXXXXXXXX, 05XXXXXXXXX, 050XXXXXXXX
function convertToIsraeliFormat(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  
  // If starts with 972, remove it and add 0
  if (digits.startsWith('972') && digits.length >= 12) {
    return '0' + digits.substring(3);
  }
  
  // If already starts with 0 and has 10 digits, return as is
  if (digits.startsWith('0') && digits.length === 10) {
    return digits;
  }
  
  // If 9 digits and starts with 5, add 0
  if (digits.length === 9 && digits.startsWith('5')) {
    return '0' + digits;
  }
  
  // If 10 digits, return as is
  if (digits.length === 10) {
    return digits;
  }
  
  return null;
}

// Get blocked senders from data.json
function getBlockedSenders() {
  const store = readStore();
  return Array.isArray(store.blockedSenders) ? store.blockedSenders : [];
}

// Cost-based credit calculation
const COST_THRESHOLD = 0.22; // USD
const CREDITS_PER_DOLLAR = 26.67; // $0.25 = 7 credits, $0.30 = 8 credits, $0.50 = 10 credits, $0.75 = 15 credits

// Credits: tiered system
// Emojis count as 3 characters, Hebrew/Unicode count as 2 characters
function calculateCreditsForMessage(message, sender = '') {
  const text = String(message || '');
  if (text.length <= 0) return 0;
  
  let weightedLength = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    
    // Check if it's an emoji (most emojis are in these ranges)
    if (code >= 0x1F600 && code <= 0x1F64F || // Emoticons
        code >= 0x1F300 && code <= 0x1F5FF || // Misc Symbols and Pictographs
        code >= 0x1F680 && code <= 0x1F6FF || // Transport and Map
        code >= 0x1F1E0 && code <= 0x1F1FF || // Regional indicators
        code >= 0x2600 && code <= 0x26FF ||   // Misc symbols
        code >= 0x2700 && code <= 0x27BF ||   // Dingbats
        code >= 0xFE00 && code <= 0xFE0F ||   // Variation selectors
        code >= 0x1F900 && code <= 0x1F9FF || // Supplemental Symbols
        code >= 0x1F018 && code <= 0x1F0F5) { // Playing cards
      weightedLength += 3; // Emoji = 3 characters
    }
    // Check if it's Hebrew or other Unicode (non-ASCII)
    else if (code > 127) {
      weightedLength += 2; // Hebrew/Unicode = 2 characters
    }
    // Regular ASCII character
    else {
      weightedLength += 1; // ASCII = 1 character
    }
  }
  
  // Calculate base credits based on character count
  let baseCredits;
  if (weightedLength <= 30) baseCredits = 2;  // 1-30 characters = 2 credits
  else if (weightedLength <= 50) baseCredits = 4;  // 31-50 characters = 4 credits
  else if (weightedLength <= 70) baseCredits = 6;  // 51-70 characters = 6 credits
  else if (weightedLength <= 90) baseCredits = 8;  // 71-90 characters = 8 credits
  else if (weightedLength <= 110) baseCredits = 10; // 91-110 characters = 10 credits
  else if (weightedLength <= 130) baseCredits = 12; // 111-130 characters = 12 credits
  else if (weightedLength <= 150) baseCredits = 14; // 131-150 characters = 14 credits
  else if (weightedLength <= 170) baseCredits = 16; // 151-170 characters = 16 credits
  else if (weightedLength <= 190) baseCredits = 18; // 171-190 characters = 18 credits
  else if (weightedLength <= 200) baseCredits = 20; // 191-200 characters = 20 credits
  else return -1; // over limit
  
  // Add 3 extra credits if sender is "cal"
  if (sender && sender.toLowerCase() === 'cal') {
    baseCredits += 3;
  }
  
  return baseCredits;
}

// Calculate credits based on actual cost from Mobivate
function calculateCreditsFromCost(costUSD) {
  if (costUSD > COST_THRESHOLD) {
    // Use cost-based calculation with specific rates
    if (costUSD >= 0.75) return 15;
    if (costUSD >= 0.50) return 10;
    if (costUSD >= 0.30) return 8;
    if (costUSD >= 0.25) return 7;
    return Math.ceil(costUSD * CREDITS_PER_DOLLAR);
  }
  return null; // Use character-based calculation
}

// Health
app.get('/health', (_req, res) => res.json({ ok:true, service:'smseem-proxy', time:new Date().toISOString() }));

// Debug endpoint (no auth required) - helps diagnose configuration issues
app.get('/api/debug/config', (_req, res) => {
  res.json({
    ok: true,
    config: {
      hasSMSEEM_API_KEY: !!SMSEEM_API_KEY,
      hasADMIN_USERNAME: !!ADMIN_USERNAME,
      hasADMIN_PASSWORD: !!ADMIN_PASSWORD,
      hasOFFICE_USERNAME: !!OFFICE_USERNAME,
      hasOFFICE_PASSWORD: !!OFFICE_PASSWORD,
      hasPROXY_API_KEY: !!PROXY_API_KEY && PROXY_API_KEY.trim() !== '',
      adminUsername: ADMIN_USERNAME || '(not set)',
      officeUsername: OFFICE_USERNAME || '(not set)',
      defaultSender: DEFAULT_SENDER
    },
    note: 'This endpoint shows configuration status. Credentials are not shown for security.'
  });
});

// Send single SMS (accepts 972-XXXXXXXXX, 972XXXXXXXXX, or 05XXXXXXXXX)
app.post('/api/sms/send', requireProxyKey, requireRoleAuth('office'), async (req, res) => {
  try {
    // Subscription expiry enforcement
    const storePre = readStore();
    if (computeIsExpired(storePre)) {
      return res.status(402).json({ ok:false, error:'Subscription expired. Please contact the administrator to renew.' });
    }
    const { to, message, sender } = req.body || {};
    
    // Accept both 972 format and Israeli format (05X...)
    const phoneRegex = /^(972-?\d{9}|0\d{8,9})$/;
    if (!isNonEmptyString(to) || !phoneRegex.test(to)) {
      return res.status(400).json({ ok:false, error:'Phone must be Israel format: 972-XXXXXXXXX, 972XXXXXXXXX, or 05XXXXXXXXX' });
    }
    if (!isNonEmptyString(message)) {
      return res.status(400).json({ ok:false, error:'Missing "message".' });
    }
    const msgCredits = calculateCreditsForMessage(message, sender);
    if (msgCredits === 0) return res.status(400).json({ ok:false, error:'Message cannot be empty' });
    if (msgCredits < 0) return res.status(400).json({ ok:false, error:'Message too long (max 200 characters)' });
    
    // Check blocked sender
    if (isNonEmptyString(sender)) {
      const normalizedSender = sender.trim().toLowerCase();
      if (getBlockedSenders().includes(normalizedSender)) {
        return res.status(400).json({ ok:false, error:`Sender name "${sender}" is blocked. Please use a different sender name.` });
      }
    }
    
    const recipient = convertToIsraeliFormat(to);
    if (!recipient) return res.status(400).json({ ok:false, error:'Invalid phone format' });

    if (!SMSEEM_API_KEY) {
      console.error('❌ SMSEEM_API_KEY is not set');
      return res.status(500).json({ ok:false, error:'SMSEEM_API_KEY is not configured. Please set it in .env file.' });
    }

    const payload = {
      to: recipient,
      message: message,
      sender: (sender || DEFAULT_SENDER).trim()
    };

    console.log('📤 Sending SMS to SMSeem:', JSON.stringify({ ...payload, Authorization: 'Bearer ***' }, null, 2));

    const r = await axios.post(`${SMSEEM_BASE_URL}/apiSendSMS`, payload, {
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${SMSEEM_API_KEY}` },
      timeout: 20_000
    });

    console.log('📨 SMSeem API Response:', JSON.stringify(r.data, null, 2));
    console.log('📨 SMSeem API Status:', r.status);

    const responseData = r.data || {};
    if (responseData.success) {
      console.log('✅ SMSeem message sent:', responseData);
      appendLog({
        type:'single_send',
        sender: payload.sender,
        recipient,
        messageId: responseData.messageId,
        status: 'sent',
        msgLen: String(message||'').length,
        msgCredits,
        messagePreview: message.slice(0, 40),
        creditsRemaining: responseData.creditsRemaining
      });
      const after = writeStore({ credits: responseData.creditsRemaining });
      return res.status(200).json({
        ok:true,
        provider: responseData,
        messageId: responseData.messageId,
        status: 'sent',
        creditsUsed: msgCredits,
        creditsRemaining: responseData.creditsRemaining
      });
    } else if (responseData.error) {
      console.error('❌ SMSeem returned error:', responseData.error);
      return res.status(400).json({
        ok:false,
        error: responseData.error,
        provider: responseData
      });
    }
    console.error('❌ Unexpected SMSeem response format:', responseData);
    return res.status(502).json({
      ok:false,
      error: 'Unexpected response format from SMSeem API',
      provider: responseData
    });
  } catch (e) {
    console.error('❌ Error sending SMS:', e.message);
    if (e.response) {
      console.error('❌ SMSeem error response:', e.response.data);
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
    const { sender, message, recipients } = req.body || {};
    if (!isNonEmptyString(sender)) return res.status(400).json({ ok:false, error:'Missing sender' });
    
    // Check blocked sender
    const normalizedSender = sender.trim().toLowerCase();
    if (getBlockedSenders().includes(normalizedSender)) {
      return res.status(400).json({ ok:false, error:`Sender name "${sender}" is blocked. Please use a different sender name.` });
    }
    
    if (!isNonEmptyString(message)) return res.status(400).json({ ok:false, error:'Missing message' });
    const msgCredits = calculateCreditsForMessage(message, sender);
    if (msgCredits === 0) return res.status(400).json({ ok:false, error:'Message cannot be empty' });
    if (msgCredits < 0) return res.status(400).json({ ok:false, error:'Message too long (max 200 characters)' });

    // Normalize recipients input: string (with commas/newlines) or array
    let list = [];
    if (Array.isArray(recipients)) list = recipients;
    else if (isNonEmptyString(recipients)) list = recipients.split(/[\s,;]+/);
    else return res.status(400).json({ ok:false, error:'Recipients required' });

    // Convert to Israeli format and filter valid numbers
    const normalized = list
      .map(v => String(v).trim())
      .filter(Boolean)
      .map(v => convertToIsraeliFormat(v))
      .filter(Boolean);

    // Deduplicate
    const uniqueRecipients = Array.from(new Set(normalized));
    if (uniqueRecipients.length === 0) return res.status(400).json({ ok:false, error:'No valid recipients' });
    
    // SMSeem API supports up to 1000 numbers per request
    if (uniqueRecipients.length > 1000) {
      return res.status(400).json({ ok:false, error:'Maximum 1000 recipients per batch' });
    }

    if (!SMSEEM_API_KEY) {
      console.error('❌ SMSEEM_API_KEY is not set');
      return res.status(500).json({ ok:false, error:'SMSEEM_API_KEY is not configured. Please set it in .env file.' });
    }

    const payload = {
      sender: sender.trim(),
      message: message,
      numbers: uniqueRecipients
    };

    console.log('📤 Sending batch SMS to SMSeem:', JSON.stringify({ ...payload, numbers: `${payload.numbers.length} numbers`, Authorization: 'Bearer ***' }, null, 2));

    const r = await axios.post(`${SMSEEM_BASE_URL}/apiSendMessages`, payload, {
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${SMSEEM_API_KEY}` },
      timeout: 30_000
    });

    console.log('📨 SMSeem Batch API Response:', JSON.stringify(r.data, null, 2));

    const responseData = r.data || {};
    if (responseData.success) {
      const sent = responseData.sent || 0;
      const failed = responseData.failed || 0;
      const creditsUsed = responseData.creditsUsed || (sent * msgCredits);
      const creditsRemaining = responseData.creditsRemaining;
      
      console.log(`✅ SMSeem batch sent: ${sent} success, ${failed} failed`);
      
      appendLog({
        type:'batch_send',
        sender: sender.trim(),
        count: uniqueRecipients.length,
        success: sent,
        failed: failed,
        msgLen: String(message||'').length,
        msgCredits,
        totalCreditsUsed: creditsUsed,
        messagePreview: message.slice(0, 40),
        creditsAfter: creditsRemaining,
        failedNumbers: responseData.failedNumbers || []
      });
      
      // Update credits from API response
      const after = writeStore({ credits: creditsRemaining });
      
      return res.json({
        ok:true,
        attempted: uniqueRecipients.length,
        success: sent,
        failed: failed,
        failedNumbers: responseData.failedNumbers || [],
        perMessage: msgCredits,
        totalUsed: creditsUsed,
        credits: after.credits,
        provider: responseData
      });
    } else if (responseData.error) {
      console.error('❌ SMSeem batch error:', responseData.error);
      return res.status(400).json({
        ok:false,
        error: responseData.error,
        provider: responseData
      });
    }
    
    console.error('❌ Unexpected SMSeem batch response format:', responseData);
    return res.status(502).json({
      ok:false,
      error: 'Unexpected response format from SMSeem API',
      provider: responseData
    });
  } catch (e) {
    console.error('❌ Error sending batch SMS:', e.message);
    if (e.response) {
      console.error('❌ SMSeem batch error response:', e.response.data);
      return res.status(e.response.status || 502).json({
        ok:false,
        error: e.response.data?.error || e.response.data || e.response.statusText || 'Upstream error'
      });
    }
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

// Admin: delivery status history
app.get('/api/deliveries', requireRoleAuth('admin'), (req, res) => {
  const store = readStore();
  res.json({ ok:true, deliveries: store.deliveries.slice(0, 200) });
});

// Admin: get real pricing from Mobivate API
app.get('/api/pricing', requireRoleAuth('admin'), async (req, res) => {
  try {
    const r = await axios.get(`${MOBIVATE_BASE_URL}/apis/sms/mt/v2/pricing`, {
      headers: { 'Authorization': `Bearer ${MOBIVATE_API_KEY}` },
      timeout: 10_000
    });
    res.json({ ok:true, pricing: r.data });
  } catch (e) {
    console.error('Error fetching pricing:', e.response?.data || e.message);
    res.status(502).json({ ok:false, error: e.response?.data || e.message || 'Failed to fetch pricing' });
  }
});

// Function to get estimated cost from Mobivate pricing API
async function getEstimatedCost(recipient, message) {
  try {
    console.log(`🔍 Fetching pricing for recipient: ${recipient}`);
    
    // Try different pricing endpoints and authentication methods
    const endpoints = [
      { url: '/apis/sms/mt/v2/pricing', auth: 'Bearer' },
      { url: '/pricing', auth: 'Bearer' },
      { url: '/sms/pricing', auth: 'Bearer' },
      { url: '/api/pricing', auth: 'Bearer' },
      { url: '/apis/sms/mt/v2/pricing', auth: 'Basic' },
      { url: '/pricing', auth: 'Basic' }
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`📡 Trying endpoint: ${endpoint}`);
        const r = await axios.get(`${MOBIVATE_BASE_URL}${endpoint}`, {
          headers: { 'Authorization': `Bearer ${MOBIVATE_API_KEY}` },
          timeout: 5_000
        });
        
        console.log(`📊 Pricing API Response from ${endpoint}:`, JSON.stringify(r.data, null, 2));
        
        const pricing = r.data;
        
        // Extract country code from recipient (assuming international format)
        const countryCode = recipient.substring(0, 3);
        
        // Try different field names for pricing data
        const possibleFields = ['networks', 'rates', 'pricing', 'countries', 'destinations'];
        const possiblePriceFields = ['price', 'cost', 'rate', 'amount', 'charge'];
        
        for (const field of possibleFields) {
          if (pricing[field] && Array.isArray(pricing[field])) {
            const network = pricing[field].find(n => 
              n.countryCode === countryCode || 
              n.country === countryCode || 
              n.code === countryCode ||
              n.destination === countryCode
            );
            
            if (network) {
              for (const priceField of possiblePriceFields) {
                if (network[priceField]) {
                  const price = parseFloat(network[priceField]);
                  console.log(`💰 Found pricing for ${countryCode}: $${price} (field: ${priceField})`);
                  return price;
                }
              }
            }
          }
        }
        
        // Try direct pricing fields
        for (const priceField of possiblePriceFields) {
          if (pricing[priceField]) {
            const price = parseFloat(pricing[priceField]);
            console.log(`💰 Using direct pricing: $${price} (field: ${priceField})`);
            return price;
          }
        }
        
        // Try default pricing
        if (pricing.defaultPrice || pricing.default) {
          const price = parseFloat(pricing.defaultPrice || pricing.default);
          console.log(`💰 Using default pricing: $${price}`);
          return price;
        }
        
      } catch (endpointError) {
        console.log(`❌ Endpoint ${endpoint} failed:`, endpointError.response?.status || endpointError.message);
        continue;
      }
    }
    
    console.log('❌ No pricing found in any endpoint');
    return null;
  } catch (e) {
    console.error('❌ Error getting estimated cost:', e.response?.data || e.message);
    return null;
  }
}

// Admin: get account balance from Mobivate API
app.get('/api/balance', requireRoleAuth('admin'), async (req, res) => {
  try {
    if (!SMSEEM_API_KEY) {
      return res.status(500).json({ ok:false, error:'SMSEEM_API_KEY is not configured' });
    }
    const r = await axios.get(`${SMSEEM_BASE_URL}/apiGetBalance`, {
      headers: { 
        'Content-Type':'application/json',
        'Authorization': `Bearer ${SMSEEM_API_KEY}`
      },
      timeout: 10_000
    });
    
    const responseData = r.data || {};
    if (responseData.success) {
      // Update local credits from API
      writeStore({ credits: responseData.balance });
      res.json({ 
        ok:true, 
        balance: responseData.balance,
        totalSent: responseData.totalSent || 0
      });
    } else {
      res.status(400).json({ ok:false, error: responseData.error || 'Failed to fetch balance' });
    }
  } catch (e) {
    console.error('Error fetching balance:', e.response?.data || e.message);
    res.status(502).json({ ok:false, error: e.response?.data?.error || e.response?.data || e.message || 'Failed to fetch balance' });
  }
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
  try {
    const { messageId, status, recipient, timestamp } = req.body || {};
    if (messageId && status && recipient) {
      appendDelivery({
        type: 'delivery_receipt',
        messageId,
        status: String(status).toUpperCase(),
        recipient: String(recipient),
        timestamp: timestamp || new Date().toISOString()
      });
      // Also update the original send log if we can match by recipient
      const store = readStore();
      const matchingLog = store.logs.find(log => 
        log.type === 'batch_send' && 
        log.time && 
        new Date(log.time) > new Date(Date.now() - 24*60*60*1000) // within last 24h
      );
      if (matchingLog) {
        matchingLog.deliveryStatus = String(status).toUpperCase();
        matchingLog.deliveryTime = new Date().toISOString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
      }
    }
  } catch (e) {
    console.error('Error processing delivery receipt:', e);
  }
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
