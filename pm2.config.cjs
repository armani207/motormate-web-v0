module.exports = {
  apps: [
    {
      name: "motormate",
      script: "server.js",

      // Auto-restart if it crashes
      autorestart: true,
      watch: false,

      // Restart if memory grows too large (good for Puppeteer)
      max_memory_restart: "500M",

      // Delay between restarts to prevent restart loops if Chromium fails
      exp_backoff_restart_delay: 3000,

      env: {
        NODE_ENV: "production",
        PORT: 8080
      },

      env_development: {
        NODE_ENV: "development",
        PORT: 8080
      },

      // Keep logs forever
      output: "./logs/out.log",
      error: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
