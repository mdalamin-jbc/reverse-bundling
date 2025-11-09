#!/bin/bash

# Nginx Configuration Validator and Reloader
LOG_FILE="/var/log/reverse-bundling/nginx-config-check.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log "Checking nginx configuration..."

if nginx -t 2>/dev/null; then
    log "Nginx configuration is valid"
else
    log "Nginx configuration is invalid"
    exit 1
fi

# Check if nginx needs reloading (compare config mtime vs service reload time)
CONFIG_MTIME=$(stat -c %Y /etc/nginx/nginx.conf 2>/dev/null || stat -f %m /etc/nginx/nginx.conf)
SERVICE_RELOAD_TIME=$(systemctl show nginx -p ExecMainStartTimestamp --value | date -d "$(cat)" +%s 2>/dev/null || echo "0")

if [ "$CONFIG_MTIME" -gt "$SERVICE_RELOAD_TIME" ] 2>/dev/null; then
    log "Nginx configuration has been modified, reloading..."
    if systemctl reload nginx; then
        log "Nginx reloaded successfully"
    else
        log "Nginx reload failed"
        exit 1
    fi
else
    log "Nginx configuration is up to date"
fi