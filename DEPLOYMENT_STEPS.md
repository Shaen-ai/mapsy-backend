# Deploy Latest Backend with Wix Authentication

## Quick Deployment Commands

SSH into the production server and run these commands:

```bash
# Navigate to backend directory
cd /var/www/mapsy-api.nextechspires.com

# Pull latest code
git pull origin main

# Install new dependencies (jsonwebtoken)
npm install

# Build the TypeScript code
npm run build

# Restart the PM2 process
pm2 restart mapsy-api

# Check the logs to verify it's working
pm2 logs mapsy-api --lines 50
```

## What Changed

The latest backend update includes:
1. **New Wix authentication middleware** (`wixAuth.ts`)
2. **Optional authentication** - API works with OR without Wix tokens
3. **New dependency**: `jsonwebtoken` for JWT verification
4. **Updated routes** to use `optionalWixAuth` middleware

## Environment Variable (Optional)

Add to `.env` file (only needed for Wix production apps):
```env
WIX_APP_SECRET=your-wix-app-secret-from-dev-center
```

Note: Without this variable set, the API still works but won't verify Wix tokens.

## Verification

After deployment, test the API:

```bash
# Test without authentication (should work)
curl https://mapsy-api.nextechspires.com/api/locations

# Test with authentication (should also work)
curl -H "Authorization: Bearer <instance-token>" https://mapsy-api.nextechspires.com/api/locations
```

Both requests should return 200 OK with location data.

## Troubleshooting

If you see "Missing instanceId" error after deployment:
1. Check that git pull succeeded
2. Verify `npm run build` completed without errors
3. Ensure PM2 restarted: `pm2 restart mapsy-api`
4. Check PM2 logs: `pm2 logs mapsy-api --err --lines 100`
