// server.js
import compression from 'compression';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import bodyParser from 'body-parser';
import fs from 'fs';
import crypto from 'crypto';
import puppeteer from 'puppeteer';
import Redis from 'ioredis';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localDataPath = path.join(__dirname, 'sheetData.json');
const staticCatalogFallbackPath = path.join(__dirname, 'src', 'assets', 'data.json');


const app = express();
app.use(compression());
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json({ limit: '64kb' }));

// -----------------------------
// Redis setup (optional — server stays up if Redis is unavailable)
// -----------------------------
const redis = new Redis({
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  reconnectOnError: () => false,
});

let redisAvailable = false;
let redisErrorLogged = false;
redis.on('ready', () => {
  redisAvailable = true;
  redisErrorLogged = false;
  console.log('✅ Redis connected');
});
redis.on('end', () => { redisAvailable = false; });
redis.on('error', (err) => {
  redisAvailable = false;
  if (!redisErrorLogged) {
    redisErrorLogged = true;
    console.warn(`⚠️  Redis unavailable (${err?.code || err?.message || 'error'}). Continuing without it.`);
  }
});

redis.connect().catch(() => {/* error handler above already warned */});

// -----------------------------
// City coords cache
// -----------------------------
const coordsPath = path.join(__dirname, 'cityCoords.json');
let cityCoords = fs.existsSync(coordsPath)
  ? JSON.parse(fs.readFileSync(coordsPath, 'utf8'))
  : {};

app.post('/api/save-coords', (req, res) => {
  const { key, coords } = req.body;
  if (!key || !coords || typeof coords.lat !== 'number' || typeof coords.lon !== 'number') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  cityCoords[key] = coords;

  try {
    fs.writeFileSync(coordsPath, JSON.stringify(cityCoords, null, 2), 'utf8');
    res.json({ success: true, key, coords });
    console.log(`✅ Saved coords for ${key} to local JSON`);
  } catch (err) {
    console.error('❌ Failed to save coords locally:', err);
    res.status(500).json({ error: 'Failed to save coordinates locally' });
  }
});

app.get('/api/city-coords', (req, res) => {
  res.json(cityCoords);
});

// -----------------------------
// Google Sheets API
// -----------------------------
async function getSheetData() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '1yebGQOBKCuaBFw0X85ryn7_3hQkGcufVa8H0acmAqw8';
  const range = 'Form Responses 1!A:Z';
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values;
}


import os from 'os';

async function getExecutablePath() {
  const platform = os.platform();

  // --- Production Linux ---
  if (platform === 'linux') {
    return '/usr/bin/chromium-browser';
  }

  // --- Local Development (macOS / Windows) ---
  // Use Puppeteer's built-in Chromium instead
  try {
    const puppeteer = await import("puppeteer");

    return puppeteer.default.executablePath();
  } catch (err) {
    console.error("Could not load Puppeteer's built-in executable:", err);
    return null;
  }
}


// -----------------------------
// Puppeteer scraper (optimized)
// -----------------------------
let browser;

async function getBrowser() {
  if (!browser) {
    const executablePath = await getExecutablePath();

    browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath || undefined, // let it auto-pick on local
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return browser;
}
// -----------------------------
// Scraper + Redis + WebSockets
// -----------------------------
async function scrapeWorldPopulation() {
  if (!redisAvailable) return; // skip scraping if we can't cache the result
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    // Block images, fonts, CSS
    await page.setRequestInterception(true);
    page.on('request', req => {
      const blocked = ['image', 'stylesheet', 'font'];
      if (blocked.includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.goto('https://www.worldometers.info/world-population/', { waitUntil: 'domcontentloaded' });

    // Wait until live data is present
    const populationSelector = 'span[rel="current_population"]';
    const birthsSelector = 'span[rel="births_today"]';
    await page.waitForFunction(
      selector => document.querySelector(selector)?.textContent !== 'retrieving data...',
      {},
      populationSelector
    );

    const population = await page.$eval(populationSelector, el => el.textContent.trim());
    const birthsToday = await page.$eval(birthsSelector, el => el.textContent.trim());
    await page.close();

    const data = { population, birthsToday, timestamp: Date.now() };

    // Save to Redis
    await redis.set('worldPop', JSON.stringify(data));

    // Broadcast to WS clients
    broadcast(data);

    console.log('Scraped and broadcasted:', data);

  } catch (err) {
    console.error('Puppeteer scraping error:', err);
  }
}

// -----------------------------
// WebSocket server
// -----------------------------
const server = app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', async ws => {
  clients.add(ws);
  console.log(`WS client connected (total: ${clients.size})`);

  // Send last cached value from Redis immediately (best effort)
  if (redisAvailable) {
    try {
      const cached = await redis.get('worldPop');
      if (cached && ws.readyState === ws.OPEN) ws.send(cached);
    } catch (err) {
      console.warn('Error sending cached Redis data:', err?.message || err);
    }
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`WS client disconnected (total: ${clients.size})`);
  });

  ws.on('error', err => console.error('WebSocket error:', err));
});

// Broadcast helper
function broadcast(data) {
  const json = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(json, err => {
        if (err) console.error('WS send error:', err?.message || err);
      });
    }
  }
}

// -----------------------------
// Run scraper periodically with memory monitoring
// -----------------------------
let scraping = false; // flag to prevent overlapping scrapes

(async () => {
  try {
    if (redisAvailable) {
      const cached = await redis.get('worldPop').catch(() => null);
      if (!cached) await scrapeWorldPopulation();
    }
  } catch (err) {
    console.warn('Initial scrape skipped:', err?.message || err);
  }

  // Regular scrape every 60 seconds (skips when Redis is offline)
  setInterval(async () => {
    if (scraping || !redisAvailable) return;
    scraping = true;
    try {
      await scrapeWorldPopulation();
    } catch (err) {
      console.error('Scrape failed:', err?.message || err);
    } finally {
      scraping = false;
    }
  }, 60_000);

  // Memory monitor every 30 seconds
  setInterval(async () => {
    const memMB = process.memoryUsage().rss / 1024 / 1024;
    if (memMB > 4000) { // 4 GB threshold
      console.log(`🚨 Memory high (${memMB.toFixed(0)} MB), restarting browser...`);
      if (browser) {
        try {
          await browser.close();
          console.log('✅ Browser successfully closed and will restart on next scrape');
        } catch (err) {
          console.error('❌ Error closing browser:', err);
        }
        browser = null;
      }
    }
  }, 30_000);
})();

// -----------------------------
// REST API fallback
// -----------------------------
app.get('/api/world-population', async (req, res) => {
  if (!redisAvailable) {
    return res.json({ population: '0', birthsToday: '0', timestamp: Date.now(), cached: true, error: 'Redis offline' });
  }
  try {
    const data = await redis.get('worldPop');
    if (data) return res.json(JSON.parse(data));
    return res.json({ population: '0', birthsToday: '0', timestamp: Date.now(), cached: true });
  } catch (err) {
    console.error('Redis error:', err?.message || err);
    return res.json({ population: '0', birthsToday: '0', timestamp: Date.now(), cached: true, error: 'Redis error' });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    let sheetData;

    try {
      // Try Google Sheets first
      sheetData = await getSheetData();

      // Save a local JSON backup for fallback
      fs.writeFileSync(localDataPath, JSON.stringify(sheetData, null, 2), 'utf8');
    } catch (googleErr) {
      console.error('Google Sheets fetch failed, using local JSON fallback:', googleErr);

      if (!fs.existsSync(localDataPath)) {
        if (fs.existsSync(staticCatalogFallbackPath)) {
          return res.json(JSON.parse(fs.readFileSync(staticCatalogFallbackPath, 'utf8')));
        }
        return res.status(500).json({ error: 'No local fallback data available' });
      }

      // Read local JSON fallback
      const jsonContent = fs.readFileSync(localDataPath, 'utf8');
      sheetData = JSON.parse(jsonContent);
    }

    const [headers, ...rows] = sheetData;
    const experiencesHeader =
      headers.find(header => {
        const normalized = String(header).toLowerCase().replace(/\s+/g, ' ');
        return normalized.includes('please share') && normalized.includes('experiences with cp');
      }) ||
      'Please share your experiences with CP and one aspect you would like to improve. If you are interested in the MotorMate device, please provide your complete mailing address. We will publish your name on the CP catalog only with your consent and will not share or sell your information to any third party.';
    const roleHeader = 'Role (select all that apply)';
    const showFullName = req.query.fullName === 'true';

    const jsonData = rows.map(row => {
      const entry = Object.fromEntries(
        headers.map((header, i) => {
          const value = row[i] ? row[i].trim() : null;
          return [header, value];
        })
      );

      const permission = entry['Would you like to share your name and address on the CP Catalog']?.toLowerCase() === 'yes';
      if (!permission) delete entry['Name'];
      else if (entry['Name'] && !showFullName) {
        const parts = entry['Name'].trim().split(/\s+/);
        const first = parts[0] || '';
        const lastInitial = parts[1] ? parts[1][0] : '';
        entry['Name'] = `${first} ${lastInitial}`.trim();
      }

      return {
        name: entry['Name'] || null,
        city: entry['City'] || null,
        state: entry['State'] || null,
        country: entry['Country'] || null,
        role: entry[roleHeader] || null,
        experiences: entry[experiencesHeader] || null,
      };
    });

    res.json(jsonData);
  } catch (err) {
    console.error('Error processing sheet data:', err);
    return res.status(500).json({ error: 'Failed to fetch sheet data' });
  }
});


app.post('/api/data/save', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid payload, expected an array' });
  }

  try {
    fs.writeFileSync(localDataPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('✅ Saved sheet data to local JSON fallback');
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to save sheet data locally:', err);
    res.status(500).json({ error: 'Failed to save data locally' });
  }
});



// -----------------------------
// Auth + community pins (file-backed)
// -----------------------------
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const usersPath = path.join(dataDir, 'users.json');
const pinsPath = path.join(dataDir, 'pins.json');
const sessionsPath = path.join(dataDir, 'sessions.json');

function readJsonFileSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Could not parse ${p}:`, err?.message || err);
    return fallback;
  }
}
function writeJsonFileSafe(p, data) {
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8'); }
  catch (err) { console.error(`Could not write ${p}:`, err?.message || err); }
}

const users = readJsonFileSafe(usersPath, {});
const pins = readJsonFileSafe(pinsPath, {});
const sessions = readJsonFileSafe(sessionsPath, {});

const SESSION_COOKIE = 'mm_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (test.length !== stored.length) return false;
  return crypto.timingSafeEqual(test, stored);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const piece of header.split(';')) {
    const idx = piece.indexOf('=');
    if (idx === -1) continue;
    const key = piece.slice(0, idx).trim();
    const value = piece.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function pruneSessions() {
  const now = Date.now();
  let changed = false;
  for (const [token, sess] of Object.entries(sessions)) {
    if (!sess || now > sess.expiresAt) { delete sessions[token]; changed = true; }
  }
  if (changed) writeJsonFileSafe(sessionsPath, sessions);
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const sess = sessions[token];
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    delete sessions[token];
    writeJsonFileSafe(sessionsPath, sessions);
    return null;
  }
  return users[sess.userId] || null;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}

function geocodeKey(city, state, country) {
  return [city, state, country].map(s => (s || '').trim()).filter(Boolean).join(', ');
}

async function geocodeViaNominatim(query) {
  if (!query) return null;
  if (cityCoords[query]) return cityCoords[query];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const results = await fetch(url, {
      headers: { 'User-Agent': 'MotorMate/0.1 (https://motormate.health)', Accept: 'application/json' }
    }).then(r => (r.ok ? r.json() : []));
    if (Array.isArray(results) && results[0]) {
      const coords = { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
      if (Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
        cityCoords[query] = coords;
        try { fs.writeFileSync(coordsPath, JSON.stringify(cityCoords, null, 2), 'utf8'); } catch {}
        return coords;
      }
    }
  } catch (err) {
    console.warn('Nominatim geocode failed for', query, err?.message || err);
  }
  return null;
}

function publicPin(p, viewerId) {
  if (!p) return null;
  const owner = users[p.userId];
  const isOwner = !!viewerId && viewerId === p.userId;
  const ownerFirstName = owner?.name ? owner.name.trim().split(/\s+/)[0] : null;
  const displayName = p.isPublic && p.name ? p.name : (ownerFirstName || 'Member');
  return {
    id: p.id,
    userId: p.userId,
    displayName,
    role: p.role || null,
    city: p.city || null,
    state: p.state || null,
    country: p.country || null,
    notes: p.notes || null,
    lat: p.lat,
    lon: p.lon,
    isOwner,
    isPublic: !!p.isPublic,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

pruneSessions();

app.post('/api/auth/signup', (req, res) => {
  const { email, password, name } = req.body || {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const normEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!trimmedName) return res.status(400).json({ error: 'Name is required.' });
  if (Object.values(users).some(u => u.email === normEmail)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }
  const id = crypto.randomUUID();
  const { salt, hash } = hashPassword(password);
  users[id] = {
    id, email: normEmail, name: trimmedName,
    salt, passwordHash: hash, createdAt: Date.now()
  };
  writeJsonFileSafe(usersPath, users);
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { userId: id, expiresAt: Date.now() + SESSION_TTL_MS };
  writeJsonFileSafe(sessionsPath, sessions);
  setSessionCookie(res, token);
  res.json({ user: publicUser(users[id]) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const normEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normEmail || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const user = Object.values(users).find(u => u.email === normEmail);
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS };
  writeJsonFileSafe(sessionsPath, sessions);
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token && sessions[token]) {
    delete sessions[token];
    writeJsonFileSafe(sessionsPath, sessions);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  res.json({ user: publicUser(user) });
});

app.get('/api/pins', (req, res) => {
  const me = getSessionUser(req);
  const list = Object.values(pins)
    .filter(p => p.isPublic || (me && me.id === p.userId))
    .map(p => publicPin(p, me?.id))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  res.json(list);
});

app.get('/api/pins/mine', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  const mine = Object.values(pins).find(p => p.userId === user.id) || null;
  if (!mine) return res.json({ pin: null });
  res.json({
    pin: {
      ...publicPin(mine, user.id),
      name: mine.name || null,
    }
  });
});

app.post('/api/pins', async (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in to add a pin.' });
  const { name, role, city, state, country, notes, isPublic } = req.body || {};
  const cleanCity = typeof city === 'string' ? city.trim() : '';
  if (!cleanCity) return res.status(400).json({ error: 'City is required.' });
  const cleanState = typeof state === 'string' ? state.trim() : '';
  const cleanCountry = typeof country === 'string' ? country.trim() : '';
  const cleanRole = typeof role === 'string' ? role.trim().slice(0, 80) : '';
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 800) : '';
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : (user.name || '').trim();

  const queryKey = geocodeKey(cleanCity, cleanState, cleanCountry);
  let coords = await geocodeViaNominatim(queryKey);
  if (!coords && cleanCountry) coords = await geocodeViaNominatim(geocodeKey(cleanCity, '', cleanCountry));
  if (!coords) coords = await geocodeViaNominatim(cleanCity);
  if (!coords) return res.status(422).json({ error: 'Could not locate that city. Try adding state and country.' });

  const existing = Object.values(pins).find(p => p.userId === user.id);
  const id = existing?.id || crypto.randomUUID();
  pins[id] = {
    id,
    userId: user.id,
    name: cleanName || null,
    role: cleanRole || null,
    city: cleanCity,
    state: cleanState || null,
    country: cleanCountry || null,
    notes: cleanNotes || null,
    isPublic: isPublic !== false,
    lat: coords.lat,
    lon: coords.lon,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  writeJsonFileSafe(pinsPath, pins);
  res.json({
    pin: {
      ...publicPin(pins[id], user.id),
      name: pins[id].name,
    }
  });
});

app.delete('/api/pins/mine', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });
  const found = Object.entries(pins).find(([, p]) => p.userId === user.id);
  if (!found) return res.json({ ok: true });
  delete pins[found[0]];
  writeJsonFileSafe(pinsPath, pins);
  res.json({ ok: true });
});

// -----------------------------
// Serve Angular frontend
// -----------------------------
const browserDistPath = path.join(__dirname, 'dist', 'motormate', 'browser');
const legacyDistPath = path.join(__dirname, 'dist', 'motormate');
const angularDistPath = fs.existsSync(path.join(browserDistPath, 'index.html'))
  ? browserDistPath
  : legacyDistPath;
console.log(`Serving Angular bundle from ${angularDistPath}`);

app.use(
  express.static(angularDistPath, {
    etag: true,
    maxAge: '7d',
    setHeaders(res, filePath) {
      const base = path.basename(filePath);
      if (/\.[a-f0-9]{8,}\.(js|css)$/i.test(base)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  })
);

app.get(/.*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(angularDistPath, 'index.html'));
});

// -----------------------------
// Graceful shutdown
// -----------------------------
process.on('exit', async () => { if (browser) await browser.close(); });
process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(); });

// Keep server alive when ancillary services (e.g. Redis) hiccup.
process.on('unhandledRejection', (reason) => {
  console.warn('Unhandled rejection (ignored to keep server alive):', reason?.message || reason);
});
