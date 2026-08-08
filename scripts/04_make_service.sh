#!/usr/bin/env bash
# Step 04: Create systemd service

set -Eeuo pipefail

# Locate and source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

PROJECT_ROOT="$(get_project_root)"
SERVICE_NAME="sack-counter"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# This script needs root to write systemd configs and start service
check_root

# Detect the real user who ran sudo
REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"
REAL_GROUP="$(id -gn "$REAL_USER")"

log_info "Creating systemd service for user: ${REAL_USER}"

# Ensure environment file exists
ENV_FILE="${PROJECT_ROOT}/.env"
if [ ! -f "$ENV_FILE" ]; then
    log_error ".env file not found at ${ENV_FILE}. Run 02_db_setup.sh first."
    exit 1
fi

# Locate virtual env uvicorn
UVICORN_BIN="${PROJECT_ROOT}/venv/bin/uvicorn"
if [ ! -f "$UVICORN_BIN" ]; then
    log_error "uvicorn not found at ${UVICORN_BIN}. Run 01_setup_venv.sh first."
    exit 1
fi

log_info "Writing systemd service file..."

# Write systemd service file
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Sack Counter Application Service
After=network.target

[Service]
Type=simple
User=${REAL_USER}
Group=${REAL_GROUP}
WorkingDirectory=${PROJECT_ROOT}
EnvironmentFile=${ENV_FILE}
ExecStart=${UVICORN_BIN} app:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

log_success "Service file written to ${SERVICE_FILE}"

log_info "Reloading systemd daemon..."
systemctl daemon-reload

log_info "Enabling service to start on boot..."
systemctl enable "${SERVICE_NAME}.service"

log_info "Starting service..."
systemctl restart "${SERVICE_NAME}.service"

# Verify service is running
log_info "Verifying service status..."
sleep 2

if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
    log_success "Sack Counter service is successfully running and active."
else
    log_error "Service is not running. Check logs with: journalctl -u ${SERVICE_NAME}.service -n 50"
    exit 1
fi
