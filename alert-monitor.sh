#!/bin/bash

# Reverse Bundling Alerting System
# Monitors logs and sends alerts for critical issues

LOG_FILE="/var/log/reverse-bundling/alert-monitor.log"
ALERT_FILE="/var/log/reverse-bundling/alerts.log"
NGINX_ERROR_LOG="/var/log/nginx/error.log"
APP_LOG_DIR="/var/log/reverse-bundling"

# Alert thresholds
MAX_502_ERRORS=5
MAX_CONNECTION_ERRORS=10
ALERT_COOLDOWN=300  # 5 minutes

# Function to log alerts
alert() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[$timestamp] [$level] $message" >> "$ALERT_FILE"
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"

    # Here you could add email notifications, Slack alerts, etc.
    # For now, we'll just log them
}

# Function to check for 502 errors in nginx logs
check_502_errors() {
    local recent_502_count=$(grep -c "502" "$NGINX_ERROR_LOG" 2>/dev/null || echo "0")

    if [ "$recent_502_count" -gt "$MAX_502_ERRORS" ]; then
        alert "CRITICAL" "High number of 502 errors detected: $recent_502_count in recent logs"
        return 1
    fi
    return 0
}

# Function to check for connection errors
check_connection_errors() {
    local connection_errors=$(grep -c "Connection refused\|upstream prematurely closed" "$NGINX_ERROR_LOG" 2>/dev/null || echo "0")

    if [ "$connection_errors" -gt "$MAX_CONNECTION_ERRORS" ]; then
        alert "WARNING" "High number of connection errors detected: $connection_errors in recent logs"
        return 1
    fi
    return 0
}

# Function to check service status
check_service_status() {
    if ! systemctl is-active --quiet reverse-bundling; then
        alert "CRITICAL" "Reverse bundling service is not running"
        return 1
    fi

    if ! systemctl is-active --quiet nginx; then
        alert "CRITICAL" "Nginx service is not running"
        return 1
    fi

    return 0
}

# Function to check disk space
check_disk_space() {
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

    if [ "$disk_usage" -gt 90 ]; then
        alert "WARNING" "Disk usage is high: ${disk_usage}%"
        return 1
    fi
    return 0
}

# Function to check memory usage
check_memory_usage() {
    local mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')

    if [ "$mem_usage" -gt 85 ]; then
        alert "WARNING" "Memory usage is high: ${mem_usage}%"
        return 1
    fi
    return 0
}

# Main monitoring function
main() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting alert monitoring..." >> "$LOG_FILE"

    local alerts_triggered=0

    check_service_status || ((alerts_triggered++))
    check_502_errors || ((alerts_triggered++))
    check_connection_errors || ((alerts_triggered++))
    check_disk_space || ((alerts_triggered++))
    check_memory_usage || ((alerts_triggered++))

    if [ "$alerts_triggered" -eq 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - All systems normal" >> "$LOG_FILE"
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') - $alerts_triggered alerts triggered" >> "$LOG_FILE"
    fi
}

# Run main function
main