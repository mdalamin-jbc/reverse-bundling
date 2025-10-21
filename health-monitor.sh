#!/bin/bash

# Reverse Bundling Health Monitoring Script
# This script monitors the application health and can restart services if needed

LOG_FILE="/var/log/reverse-bundling/health-monitor.log"
HEALTH_URL="http://127.0.0.1:3000/health"
NGINX_HEALTH_URL="https://reverse-bundling.me/health"
MAX_RETRIES=3
RETRY_DELAY=5

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to check application health
check_app_health() {
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -s --max-time 10 --fail "$HEALTH_URL" > /dev/null 2>&1; then
            return 0
        fi
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            log "Application health check failed, retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
    done
    return 1
}

# Function to check nginx health
check_nginx_health() {
    if curl -s --max-time 10 --fail -k "$NGINX_HEALTH_URL" > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Function to restart application
restart_app() {
    log "Attempting to restart reverse-bundling service..."
    if sudo systemctl restart reverse-bundling; then
        log "Service restart successful"
        sleep 10  # Wait for service to start
        return 0
    else
        log "Service restart failed"
        return 1
    fi
}

# Function to restart nginx
restart_nginx() {
    log "Attempting to restart nginx service..."
    if sudo systemctl restart nginx; then
        log "Nginx restart successful"
        return 0
    else
        log "Nginx restart failed"
        return 1
    fi
}

# Main monitoring logic
log "Starting health check..."

# Check application health
if ! check_app_health; then
    log "Application health check failed after $MAX_RETRIES attempts"
    if restart_app; then
        if check_app_health; then
            log "Application recovered successfully"
        else
            log "Application failed to recover"
            exit 1
        fi
    else
        log "Failed to restart application"
        exit 1
    fi
else
    log "Application is healthy"
fi

# Check nginx health
if ! check_nginx_health; then
    log "Nginx health check failed"
    if restart_nginx; then
        if check_nginx_health; then
            log "Nginx recovered successfully"
        else
            log "Nginx failed to recover"
            exit 1
        fi
    else
        log "Failed to restart nginx"
        exit 1
    fi
else
    log "Nginx is healthy"
fi

log "Health check completed successfully"
exit 0