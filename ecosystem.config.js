module.exports = {
  apps: [
    {
      name: 'mapsy-api',
      script: './dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 8000
      },
      error_file: '~/.pm2/logs/mapsy-api-error.log',
      out_file: '~/.pm2/logs/mapsy-api-out.log',
      log_file: '~/.pm2/logs/mapsy-api-combined.log',
      time: true,
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,

      // Restart policy
      min_uptime: '10s',
      max_restarts: 10,

      // Auto restart on file changes (disabled in production)
      // watch: ['dist'],
      // ignore_watch: ['node_modules', 'logs', 'uploads'],

      // Environment specific configurations
      env_development: {
        NODE_ENV: 'development',
        PORT: 8000,
        watch: true
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8000,
        watch: false
      }
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'shahen',
      host: 'mapsy-api.nextechspires.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/mapsy.git',
      path: '/var/www/mapsy-api.nextechspires.com',
      'post-deploy': 'cd backend && npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'echo "Deploying to production server..."'
    }
  }
};