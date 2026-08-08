#!/usr/bin/env bash
# Step 06: Diagnostic, status check, and repair utility

set -Eeuo pipefail

# Locate and source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

PROJECT_ROOT="$(get_project_root)"
SERVICE_NAME="sack-counter"
VENV_PYTHON="${PROJECT_ROOT}/venv/bin/python"
if [ ! -f "$VENV_PYTHON" ] && [ -f "${PROJECT_ROOT}/venv/Scripts/python.exe" ]; then
    VENV_PYTHON="${PROJECT_ROOT}/venv/Scripts/python.exe"
fi

log_info "Starting diagnostics and health checks..."

# Helper for sudo systemctl execution depending on user permissions
run_systemctl() {
    if [ "$EUID" -eq 0 ]; then
        systemctl "$@"
    else
        sudo systemctl "$@"
    fi
}

HEALTH_OK=true

# 1. Check Virtual Environment
log_info "1. Checking Virtual Environment..."
if [ ! -f "$VENV_PYTHON" ]; then
    log_error "Virtual environment python is missing at ${VENV_PYTHON}!"
    HEALTH_OK=false
else
    log_success "Virtual environment python is present."
fi

# 2. Check Database Connectivity
log_info "2. Checking Database Connectivity..."
if [ -f "$VENV_PYTHON" ]; then
    if ! "$VENV_PYTHON" -c "
import database
conn = database.get_connection()
conn.cursor().execute('SELECT name FROM sqlite_master;')
conn.close()
" 2>/dev/null; then
        log_error "Database connection failed or tables missing!"
        HEALTH_OK=false
    else
        log_success "Database is reachable and responding to queries."
    fi
else
    log_warning "Skipping database check because python venv is missing."
    HEALTH_OK=false
fi

# 3. Check App Configurations & Port
log_info "3. Checking Application Port configuration..."
APP_PORT=8000
if [ -f "$VENV_PYTHON" ]; then
    APP_PORT=$("$VENV_PYTHON" -c "from config import settings; print(settings.APP_PORT)" 2>/dev/null || echo 8000)
fi

log_info "Application is configured to run on port: ${APP_PORT}"

# Check if port is in use
if check_command ss; then
    PORT_IN_USE=$(ss -tlnp | grep -F ":${APP_PORT} " || true)
elif check_command netstat; then
    PORT_IN_USE=$(netstat -tln | grep -F ":${APP_PORT} " || true)
else
    PORT_IN_USE=""
    log_warning "Neither 'ss' nor 'netstat' is available. Skipping port-occupancy check."
fi

if [ -n "$PORT_IN_USE" ]; then
    log_success "Port ${APP_PORT} is open / in use."
else
    log_warning "No listener found on port ${APP_PORT}. Application might be down."
    HEALTH_OK=false
fi

# 4. Check systemd Service Status
log_info "4. Checking systemd service status..."
if check_command systemctl; then
    if run_systemctl is-active --quiet "${SERVICE_NAME}.service"; then
        log_success "Service '${SERVICE_NAME}' is active."
    else
        log_error "Service '${SERVICE_NAME}' is INACTIVE/DOWN!"
        HEALTH_OK=false
        
        # Repair attempt
        log_info "Attempting to repair service by restarting..."
        if run_systemctl restart "${SERVICE_NAME}.service"; then
            sleep 2
            if run_systemctl is-active --quiet "${SERVICE_NAME}.service"; then
                log_success "Service successfully restarted and is now active."
                HEALTH_OK=true
            else
                log_error "Failed to activate service after restart attempt."
            fi
        else
            log_error "Could not restart service."
        fi
    fi
else
    log_warning "systemctl is not available. Skipping systemd service checks."
fi

# 5. Show recent logs
log_info "5. Fetching recent application logs (last 10 lines)..."
if check_command journalctl; then
    journalctl -u "${SERVICE_NAME}.service" -n 10 --no-pager || true
else
    # Fallback to local logs
    LOG_FILE="${PROJECT_ROOT}/logs/app.log"
    if [ -f "$LOG_FILE" ]; then
        tail -n 10 "$LOG_FILE"
    else
        log_warning "No log file found at ${LOG_FILE}."
    fi
fi

# Summary
echo "--------------------------------------------------"
if [ "$HEALTH_OK" = true ]; then
    log_success "DIAGNOSTIC SUMMARY: ALL SYSTEMS OK."
    exit 0
else
    log_error "DIAGNOSTIC SUMMARY: SYSTEM HAS ERRORS. Please check the logs above."
    exit 1
fi
echo "--------------------------------------------------"
