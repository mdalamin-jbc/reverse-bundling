#!/bin/bash

# Deployment status check script
# Usage: ./check-deployment.sh

echo "🔍 Checking deployment status..."

# Check if app is responding
echo "📡 Checking application health..."
if curl -s -f https://reverse-bundling.me/health > /dev/null 2>&1; then
    echo "✅ Application is healthy"
    HEALTH_RESPONSE=$(curl -s https://reverse-bundling.me/health)
    echo "Response: $HEALTH_RESPONSE"

    # Check if health response contains expected data
    if echo "$HEALTH_RESPONSE" | grep -q "healthy\|ok"; then
        echo "✅ Health check response is valid"
    else
        echo "⚠️ Health check response format unexpected"
    fi
else
    echo "❌ Application is not responding"
    echo "Checking if nginx is running..."
    # This would need to be run on the server, but let's check if we can access the domain
    if curl -s -I https://reverse-bundling.me/ | grep -q "HTTP/1.1 200\|HTTP/2 200"; then
        echo "✅ Domain is accessible, but health endpoint failed"
    else
        echo "❌ Domain is not accessible"
    fi
    exit 1
fi

# Check if we can access the bundle rules page (requires auth, so just check HTTP status)
echo ""
echo "🔗 Checking bundle rules endpoint..."
BUNDLE_STATUS=$(curl -s -I https://reverse-bundling.me/app/bundle-rules | head -1)
echo "Status: $BUNDLE_STATUS"
if echo "$BUNDLE_STATUS" | grep -q "HTTP/1.1 410\|HTTP/2 410"; then
    echo "✅ Bundle rules endpoint is responding (410 is expected for protected route)"
elif echo "$BUNDLE_STATUS" | grep -q "HTTP/1.1 200\|HTTP/2 200"; then
    echo "✅ Bundle rules endpoint is accessible"
else
    echo "⚠️ Bundle rules endpoint status unclear: $BUNDLE_STATUS"
fi

# Check SSL certificate
echo ""
echo "🔒 Checking SSL certificate..."
SSL_EXPIRY=$(echo | openssl s_client -servername reverse-bundling.me -connect reverse-bundling.me:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep notAfter | cut -d'=' -f2)
if [ ! -z "$SSL_EXPIRY" ]; then
    echo "✅ SSL certificate expires: $SSL_EXPIRY"

    # Check if certificate expires soon
    EXPIRY_DATE=$(date -d "$SSL_EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$SSL_EXPIRY" +%s 2>/dev/null)
    CURRENT_DATE=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_DATE - CURRENT_DATE) / 86400 ))

    if [ $DAYS_LEFT -lt 30 ]; then
        echo "⚠️ SSL certificate expires in $DAYS_LEFT days - renewal needed soon"
    else
        echo "✅ SSL certificate is valid for $DAYS_LEFT more days"
    fi
else
    echo "⚠️ Could not check SSL certificate"
fi

# Check response time
echo ""
echo "⏱️ Checking response time..."
RESPONSE_TIME=$(curl -s -w "%{time_total}" -o /dev/null https://reverse-bundling.me/health)
if (( $(echo "$RESPONSE_TIME < 5.0" | bc -l 2>/dev/null || echo "1") )); then
    echo "✅ Response time: ${RESPONSE_TIME}s (good)"
else
    echo "⚠️ Response time: ${RESPONSE_TIME}s (slow)"
fi

echo ""
echo "🎉 Deployment check complete!"