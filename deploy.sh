#!/bin/bash

# Deployment script for Mapsy Backend API
# This script should be run on the production server

echo "🚀 Starting Mapsy Backend Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the backend directory.${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install dependencies${NC}"
    exit 1
fi

echo -e "${YELLOW}🔨 Building the project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Build failed${NC}"
    exit 1
fi

echo -e "${YELLOW}✅ Checking if dist folder exists...${NC}"
if [ -d "dist" ] && [ -f "dist/server.js" ]; then
    echo -e "${GREEN}✓ Build successful - dist/server.js exists${NC}"
else
    echo -e "${RED}Error: dist/server.js not found after build${NC}"
    exit 1
fi

echo -e "${YELLOW}🔄 Restarting PM2 process...${NC}"

# Check if PM2 process exists
pm2 describe mapsy-api > /dev/null 2>&1

if [ $? -eq 0 ]; then
    # Process exists, restart it
    echo "Restarting existing PM2 process..."
    pm2 restart mapsy-api
else
    # Process doesn't exist, start it
    echo "Starting new PM2 process..."
    pm2 start npm --name mapsy-api -- run start
fi

# Save PM2 configuration
pm2 save

echo -e "${GREEN}✨ Deployment complete!${NC}"
echo ""
echo "📊 PM2 Status:"
pm2 status mapsy-api

echo ""
echo "📝 View logs with:"
echo "  pm2 logs mapsy-api"
echo "  pm2 logs mapsy-api --err"