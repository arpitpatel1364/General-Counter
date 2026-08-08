#!/usr/bin/env bash
# Sack Counter — Master Setup Script

set -Eeuo pipefail

# Find project directory and source helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/scripts/common.sh"

PROJECT_ROOT="$(get_project_root)"

log_info "Starting Sack Counter complete production setup..."

# Ensure execution rights for all subscripts
log_info "Ensuring script files are executable..."
chmod +x "${PROJECT_ROOT}"/scripts/*.sh

# Step 01: Setup Venv
log_info "Executing Step 1/5: Setup Virtual Environment..."
"${PROJECT_ROOT}/scripts/01_setup_venv.sh"

# Step 02: DB Setup
log_info "Executing Step 2/5: Database Setup..."
"${PROJECT_ROOT}/scripts/02_db_setup.sh"

# Step 03: DB Migrate
log_info "Executing Step 3/5: Database Migrations..."
"${PROJECT_ROOT}/scripts/03_db_migrate.sh"

# Steps 4 & 5 require sudo. Notify the user.
log_warning "The remaining steps (Service Setup & Sudoers Config) require root (sudo) privileges."

# Step 04: Make Service
log_info "Executing Step 4/5: Generating systemd service (using sudo)..."
sudo "${PROJECT_ROOT}/scripts/04_make_service.sh"

# Step 05: Sudoers configuration
log_info "Executing Step 5/5: Configuring Sudoers file (using sudo)..."
sudo "${PROJECT_ROOT}/scripts/05_sudoers.sh"

log_success "Sack Counter setup completed successfully!"
log_info "To check system health or run repairs, you can execute: ./scripts/06_repair_service.sh"
EOF
