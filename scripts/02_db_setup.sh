#!/usr/bin/env bash
# Step 02: Database verification and setup

set -Eeuo pipefail

# Locate and source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

PROJECT_ROOT="$(get_project_root)"
ENV_FILE="${PROJECT_ROOT}/.env"
ENV_EXAMPLE="${PROJECT_ROOT}/.env.example"

log_info "Setting up database configurations..."

# Create .env from template if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    log_info "Creating .env configuration file from example..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    log_success ".env file created. Please update it with your settings if necessary."
else
    log_info ".env configuration file already exists."
fi

# Locate Python in virtual environment
VENV_PYTHON="${PROJECT_ROOT}/venv/bin/python"
if [ ! -f "$VENV_PYTHON" ] && [ -f "${PROJECT_ROOT}/venv/Scripts/python.exe" ]; then
    VENV_PYTHON="${PROJECT_ROOT}/venv/Scripts/python.exe"
fi

if [ ! -f "$VENV_PYTHON" ]; then
    log_error "Virtual environment python not found. Run 01_setup_venv.sh first."
    exit 1
fi

# Resolve database file path from config
DB_PATH=$("$VENV_PYTHON" -c "
try:
    from config import settings
    print(settings.DATABASE)
except Exception as e:
    import sys
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
")

log_info "Configured Database Path: ${DB_PATH}"

# Ensure parent directory exists and is writeable
DB_DIR=$(dirname "$DB_PATH")
if [ ! -d "$DB_DIR" ]; then
    log_info "Creating database directory: ${DB_DIR}"
    mkdir -p "$DB_DIR"
fi

if [ ! -w "$DB_DIR" ]; then
    log_error "Database directory is not writeable: ${DB_DIR}"
    exit 1
fi

# Check if database software dependencies are functional
if ! "$VENV_PYTHON" -c "import sqlite3; conn = sqlite3.connect(':memory:'); conn.close()" 2>/dev/null; then
    log_error "Python sqlite3 module is not functional."
    exit 1
fi

log_success "Database dependencies and directory permissions are correct."
