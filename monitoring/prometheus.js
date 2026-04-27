// monitoring/prometheus.js
import client from "prom-client";
import os from "os";

// Create a Registry (isolates metrics)
const register = new client.Registry();

// Default system metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({
  prefix: "motormate_",
  register
});

/* ---------------------------------------
   Custom Metrics
--------------------------------------- */

// WebSocket clients connected
export const wsClientGauge = new client.Gauge({
  name: "motormate_ws_clients",
  help: "Number of active WebSocket clients",
});
register.registerMetric(wsClientGauge);

// Last scraper execution timestamp
export const scraperTimestamp = new client.Gauge({
  name: "motormate_scraper_last_timestamp",
  help: "Unix timestamp of last scraper run",
});
register.registerMetric(scraperTimestamp);

// Scraper duration
export const scraperDuration = new client.Gauge({
  name: "motormate_scraper_duration_ms",
  help: "Duration of scraper execution in milliseconds",
});
register.registerMetric(scraperDuration);

// Scraper error count
export const scraperErrors = new client.Counter({
  name: "motormate_scraper_errors_total",
  help: "Total number of scraper errors",
});
register.registerMetric(scraperErrors);

// Browser restart count
export const browserRestarts = new client.Counter({
  name: "motormate_browser_restarts_total",
  help: "Total number of Puppeteer browser restarts",
});
register.registerMetric(browserRestarts);

// Redis latency
export const redisLatency = new client.Gauge({
  name: "motormate_redis_ping_ms",
  help: "Redis ping latency in ms",
});
register.registerMetric(redisLatency);


/* ---------------------------------------
   Export metrics endpoint handler
--------------------------------------- */
export async function metricsEndpoint(req, res) {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).send("Error generating metrics");
  }
}
