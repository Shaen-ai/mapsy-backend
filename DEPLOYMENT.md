# Backend Deployment Guide

## Prerequisites
- Node.js v18+ installed on server
- PM2 installed globally (`npm install -g pm2`)
- MongoDB connection configured
- Environment variables set up

## Quick Deployment

### Method 1: Using the deployment script

SSH into your server and navigate to the backend directory:

```bash
cd /var/www/mapsy-api.nextechspires.com
```

Run the deployment script:

```bash
chmod +x deploy.sh
./deploy.sh
```

This script will:
1. Install dependencies
2. Build the TypeScript project
3. Start/restart PM2 process

### Method 2: Manual deployment

1. **SSH into your server:**
   ```bash
   ssh shahen@mapsy-api.nextechspires.com
   ```

2. **Navigate to the backend directory:**
   ```bash
   cd /var/www/mapsy-api.nextechspires.com
   ```

3. **Pull latest code (if using git):**
   ```bash
   git pull origin main
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Build the project:**
   ```bash
   npm run build
   ```

   This creates the `dist` folder with compiled JavaScript files.

6. **Start with PM2:**

   Using ecosystem file (recommended):
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

   Or using npm script:
   ```bash
   pm2 start npm --name mapsy-api -- run start
   ```

   Or directly:
   ```bash
   pm2 start dist/server.js --name mapsy-api
   ```

## PM2 Commands

### Managing the process:
```bash
# Check status
pm2 status mapsy-api

# View logs
pm2 logs mapsy-api
pm2 logs mapsy-api --lines 50

# View error logs only
pm2 logs mapsy-api --err

# Restart
pm2 restart mapsy-api

# Stop
pm2 stop mapsy-api

# Delete from PM2
pm2 delete mapsy-api

# Monitor in real-time
pm2 monit
```

### Save PM2 configuration:
```bash
# Save current process list
pm2 save

# Set up PM2 to restart on system reboot
pm2 startup
```

## Environment Variables

Create a `.env` file in the backend directory:

```env
NODE_ENV=production
PORT=8000
MONGODB_URI=mongodb://localhost:27017/mapsy
# Add other environment variables as needed
```

## Troubleshooting

### Error: Cannot find module '/dist/server.js'

**Cause:** The TypeScript code hasn't been compiled to JavaScript.

**Solution:**
```bash
npm run build
```

### Error: PM2 process keeps restarting

**Check logs:**
```bash
pm2 logs mapsy-api --err --lines 100
```

**Common fixes:**
1. Check MongoDB connection
2. Verify environment variables
3. Check port availability: `lsof -i :8000`
4. Ensure all dependencies are installed: `npm install`

### Error: Permission denied

**Fix permissions:**
```bash
sudo chown -R $(whoami):$(whoami) /var/www/mapsy-api.nextechspires.com
```

## Production Best Practices

1. **Always build before starting:**
   ```bash
   npm run build && pm2 restart mapsy-api
   ```

2. **Use ecosystem file for configuration:**
   - Maintains consistent settings
   - Easy environment management
   - Supports clustering

3. **Monitor resources:**
   ```bash
   pm2 monit
   ```

4. **Set up log rotation:**
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   pm2 set pm2-logrotate:retain 7
   ```

5. **Enable clustering for better performance:**
   ```bash
   pm2 start ecosystem.config.js -i max
   ```

## Nginx Configuration (if using reverse proxy)

```nginx
server {
    listen 80;
    server_name mapsy-api.nextechspires.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Automated Deployment with GitHub Actions

Create `.github/workflows/deploy.yml` in your repository:

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: mapsy-api.nextechspires.com
          username: shahen
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /var/www/mapsy-api.nextechspires.com
            git pull origin main
            npm install
            npm run build
            pm2 restart mapsy-api
```

## Health Check

After deployment, verify the API is working:

```bash
# Check if server is running
curl http://localhost:8000/health

# Check API endpoint
curl http://localhost:8000/api/locations
```