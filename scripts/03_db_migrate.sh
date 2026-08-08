#!/usr/bin/env bash
# Step 03: Run database migrations / schema initialization

set -Eeuo pipefail

# Locate and source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

PROJECT_ROOT="$(get_project_root)"

# Locate Python in virtual environment
VENV_PYTHON="${PROJECT_ROOT}/venv/bin/python"
if [ ! -f "$VENV_PYTHON" ] && [ -f "${PROJECT_ROOT}/venv/Scripts/python.exe" ]; then
    VENV_PYTHON="${PROJECT_ROOT}/venv/Scripts/python.exe"
fi

if [ ! -f "$VENV_PYTHON" ]; then
    log_error "Virtual environment python not found. Run 01_setup_venv.sh first."
    exit 1
fi

log_info "Verifying database reachability..."

# Check database connection and verify query capability
if ! "$VENV_PYTHON" -c "
import sys
try:
    import database
    conn = database.get_connection()
    conn.cursor().execute('SELECT 1;')
    conn.close()
except Exception as e:
    print(f'Database connection failed: {e}', file=sys.stderr)
    sys.exit(1)
"; then
    log_error "Database connection verification failed."
    exit 1
fi

log_info "Running database migrations/initialization..."

# Run the database schema initialization
if ! "$VENV_PYTHON" -c "
import sys
try:
    import database
    database.init_db()
    print('Schema initialized successfully.')
except Exception as e:
    print(f'Migration failed: {e}', file=sys.stderr)
    sys.exit(1)
"; then
    log_error "Database schema initialization failed."
    exit 1
fi

log_success "Database migrations/schema setup completed successfully."
