# Deploy Instance-Based Location Filtering

## What Changed

Added multi-tenancy support so each Wix instance only sees their own locations:

1. **Location Model** - Added `instanceId` field (indexed, sparse)
2. **Location Controller** - Filters all queries by `instanceId`
3. **Access Control** - Prevents cross-instance data access

## Deployment Steps

SSH into production server and run:

```bash
cd /var/www/mapsy-api.nextechspires.com

# Pull latest code
git pull origin main

# Install dependencies (no new dependencies, but good practice)
npm install

# Build
npm run build

# Restart
pm2 restart mapsy-api

# Check logs
pm2 logs mapsy-api --lines 50
```

## Important Notes

### Backward Compatibility

- **Existing locations** (without instanceId) will ONLY show in dashboard (non-Wix requests)
- **New locations** created from Wix widgets will have instanceId and be isolated
- **Dashboard access** (without instance token) shows only locations without instanceId

### How It Works

**Widget Requests (with instance token):**
- Only see locations with matching `instanceId`
- Can only create/update/delete their own locations
- Complete data isolation between Wix sites

**Dashboard Requests (no instance token):**
- See only locations without `instanceId` (existing/standalone locations)
- For managing locations not associated with any Wix instance

### Migration (Optional)

If you want to assign existing locations to a specific Wix instance:

```bash
# Connect to MongoDB
mongo mapsy

# Assign all existing locations to a specific instance
db.locations.updateMany(
  { instanceId: { $exists: false } },
  { $set: { instanceId: "your-instance-id-here" } }
)
```

## Verification

After deployment, test with curl:

```bash
# Request without instance token - should return locations without instanceId
curl https://mapsy-api.nextechspires.com/api/locations

# Request with instance token - should return only that instance's locations
curl -H "Authorization: Bearer <wix-instance-token>" \
     https://mapsy-api.nextechspires.com/api/locations
```

## Troubleshooting

**Widget shows no locations:**
- Check that locations were created WITH the instance token
- Verify the widget is sending the Authorization header
- Check backend logs: `pm2 logs mapsy-api --lines 100`

**Dashboard shows no locations:**
- This is expected if all locations have instanceId
- Dashboard only shows locations without instanceId
- Use dashboard WITH instance token to manage Wix locations

**Cross-instance access:**
- Should return 403 Forbidden
- Check logs for "Access denied" messages
