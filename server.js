// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import bodyParser from 'body-parser';
import fs from 'fs';
import puppeteer from 'puppeteer';
import Redis from 'ioredis';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localDataPath = path.join(__dirname, 'sheetData.json');


const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

// -----------------------------
// Redis setup
// -----------------------------
const redis = new Redis();

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

  // Send last cached value from Redis immediately
  try {
    const cached = await redis.get('worldPop');
    if (cached && ws.readyState === WebSocket.OPEN) ws.send(cached);
  } catch (err) {
    console.error('Error sending cached Redis data:', err);
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
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json, err => {
        if (err) console.error('WS send error:', err);
      });
    }
  }
}

// -----------------------------
// Run scraper periodically with memory monitoring
// -----------------------------
let scraping = false; // flag to prevent overlapping scrapes

(async () => {
  // Initial scrape to populate Redis and broadcast
  const cached = await redis.get('worldPop');
  if (!cached) await scrapeWorldPopulation();

  // Regular scrape every 60 seconds
  setInterval(async () => {
    if (scraping) return; // skip if previous scrape still running
    scraping = true;
    try {
      await scrapeWorldPopulation();
    } catch (err) {
      console.error('Scrape failed:', err);
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
  try {
    const data = await redis.get('worldPop');
    if (data) return res.json(JSON.parse(data));
    return res.json({ population: '0', birthsToday: '0', timestamp: Date.now(), cached: true });
  } catch (err) {
    console.error('Redis error:', err);
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
        return res.status(500).json({ error: 'No local fallback data available' });
      }

      // Read local JSON fallback
      const jsonContent = fs.readFileSync(localDataPath, 'utf8');
      sheetData = JSON.parse(jsonContent);
    }

    const [headers, ...rows] = sheetData;
    const experiencesHeader =
      'Please share you experiences with CP and one aspect you would like to improve. If you are interested in the MotorMate device, please provide you complete mailing address. We will publish your name on the CP catalog only with your consent and will not share or sell your information to any third party.';
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
// Serve Angular frontend
// -----------------------------
const angularDistPath = path.join(__dirname, 'dist', 'motormate');
app.use(express.static(angularDistPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(angularDistPath, 'index.html'));
});

// -----------------------------
// Graceful shutdown
// -----------------------------
process.on('exit', async () => { if (browser) await browser.close(); });
process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(); });
