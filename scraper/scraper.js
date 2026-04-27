import puppeteer from "puppeteer";
import fs from "fs";
import os from "os";

import {
  scraperDuration,
  scraperTimestamp,
  scraperErrors,
  browserRestarts
} from "../monitoring/prometheus.js";

let browser = null;
let isScraping = false;

/* ---------------------------------------
   Resolve Chromium executable
--------------------------------------- */
async function resolveChromium() {
  const candidates = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser-stable"
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // fallback to Puppeteer bundle
  try {
    const mod = await import("puppeteer");
    return mod.default.executablePath();
  } catch (e) {
    console.error("❌ Chromium not found:", e);
    return null;
  }
}

/* ---------------------------------------
   Browser Watchdog (Prometheus wired)
--------------------------------------- */
export async function ensureBrowser() {
  // Browser is alive → reuse it
  if (browser && browser.process() && !browser.process().killed) {
    return browser;
  }

  console.log("🔄 Launching fresh Chromium...");
  browserRestarts.inc();  // PROMETHEUS METRIC

  const executablePath = await resolveChromium();

  browser = await puppeteer.launch({
    headless: "new",
    executablePath: executablePath || undefined,
    ignoreHTTPSErrors: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check"
    ]
  });

  browser.on("disconnected", () => {
    console.error("⚠ Chromium disconnected — will restart automatically.");
    browser = null;
  });

  return browser;
}

/* ---------------------------------------
   Scraping Logic (Prometheus wired)
--------------------------------------- */
export async function scrapeWorldPopulation() {
  if (isScraping) {
    console.log("⏳ Skipping: scrape already in progress");
    return null;
  }

  isScraping = true;

  let page = null;
  const startTime = Date.now(); // START TIMER FOR METRIC

  try {
    const browser = await ensureBrowser();
    page = await browser.newPage();

    // Block heavy resources
    await page.setRequestInterception(true);
    page.on("request", req => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else req.continue();
    });

    await page.goto("https://www.worldometers.info/world-population/", {
      waitUntil: "domcontentloaded",
      timeout: 20000
    });

    await page.waitForSelector('span[rel="current_population"]', { timeout: 10000 });

    const data = await page.evaluate(() => ({
      population: document.querySelector('span[rel="current_population"]').textContent.trim(),
      birthsToday: document.querySelector('span[rel="births_today"]').textContent.trim(),
      timestamp: Date.now()
    }));

    // PROMETHEUS METRICS
    scraperDuration.set(Date.now() - startTime);
    scraperTimestamp.set(Date.now());

    return data;

  } catch (err) {
    console.error("❌ Scraping failure:", err);

    // PROMETHEUS ERROR METRIC
    scraperErrors.inc();

    return null;

  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
    isScraping = false;
  }
}

export async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
}
