#!/bin/bash

# Deployment status check script
# Usage: ./check-deployment.sh

echo "🔍 Checking deployment status..."

# Check if app is responding
echo "📡 Checking application health..."
if curl -s -f https://reverse-bundling.me/health > /dev/null 2>&1; then
    echo "✅ Application is healthy"
    curl -s https://reverse-bundling.me/health
else
    echo "❌ Application is not responding"
    exit 1
fi

# Check if we can access the bundle rules page (requires auth, so just check HTTP status)
echo ""
echo "🔗 Checking bundle rules endpoint..."
if curl -s -I https://reverse-bundling.me/app/bundle-rules | grep -q "HTTP/1.1 410"; then
    echo "✅ Bundle rules endpoint is responding (410 is expected for protected route)"
else
    echo "⚠️ Bundle rules endpoint status unclear"
fi

# Check SSL certificate
echo ""
echo "🔒 Checking SSL certificate..."
SSL_EXPIRY=$(echo | openssl s_client -servername reverse-bundling.me -connect reverse-bundling.me:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep notAfter | cut -d'=' -f2)
if [ ! -z "$SSL_EXPIRY" ]; then
    echo "✅ SSL certificate expires: $SSL_EXPIRY"
else
    echo "⚠️ Could not check SSL certificate"
fi

echo ""
echo "🎉 Deployment check complete!"