#!/bin/bash

echo "🚀 Deploying Mapsy Backend API..."

# Build the project
echo "📦 Building backend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful!"
echo ""
echo "📝 Deployment Instructions:"
echo "1. Upload the following to your server:"
echo "   - dist/ folder (compiled JavaScript)"
echo "   - package.json"
echo "   - .env (with production values)"
echo "   - credentials/ folder (if using Google Cloud Storage)"
echo ""
echo "2. On the server, run:"
echo "   npm install --production"
echo "   pm2 restart mapsy-api"
echo ""
echo "3. Verify the API is running:"
echo "   curl https://mapsy-api.nextechspires.com/api/widget-config"
echo ""
echo "⚠️  IMPORTANT: The CORS policy now allows all origins for widget compatibility."
echo "   This is necessary for widgets embedded on various domains."