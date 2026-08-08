#!/usr/bin/env bash
# Step 01: Setup Python Virtual Environment

set -Eeuo pipefail

# Locate and source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

PROJECT_ROOT="$(get_project_root)"
VENV_DIR="${PROJECT_ROOT}/venv"
REQ_FILE="${PROJECT_ROOT}/requirements.txt"
HASH_FILE="${VENV_DIR}/.requirements.hash"

log_info "Setting up Python virtual environment..."

# Ensure python3 is installed
if ! check_command python3; then
    log_error "Python 3 is not installed on the system."
    exit 1
fi

# Detect Python version
PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
log_info "Detected Python version: ${PYTHON_VERSION}"

# Create virtual environment if not exists
if [ ! -d "$VENV_DIR" ]; then
    log_info "Creating virtual environment in ${VENV_DIR}..."
    if ! python3 -m venv "$VENV_DIR"; then
        log_warning "Standard venv module failed. Attempting to install python3-venv..."
        log_error "Failed to create virtual environment. Please ensure 'python3-venv' package is installed."
        exit 1
    fi
    log_success "Virtual environment created."
else
    log_info "Virtual environment already exists."
fi

# Use virtual environment python and pip
VENV_PYTHON="${VENV_DIR}/bin/python"
VENV_PIP="${VENV_DIR}/bin/pip"

# On Windows/MSYS, venv binary folder might be 'Scripts' instead of 'bin'
if [ ! -f "$VENV_PYTHON" ] && [ -f "${VENV_DIR}/Scripts/python.exe" ]; then
    VENV_PYTHON="${VENV_DIR}/Scripts/python.exe"
    VENV_PIP="${VENV_DIR}/Scripts/pip.exe"
fi

# Double check that we can run the virtualenv python
if [ ! -f "$VENV_PYTHON" ]; then
    log_error "Virtual environment Python executable not found at: ${VENV_PYTHON}"
    exit 1
fi

# Calculate checksum of requirements.txt
REQ_HASH=""
if check_command md5sum; then
    REQ_HASH=$(md5sum "$REQ_FILE" | cut -d' ' -f1)
elif check_command shasum; then
    REQ_HASH=$(shasum "$REQ_FILE" | cut -d' ' -f1)
else
    # Fallback to file size and modification time if no hashing utility
    REQ_HASH=$(stat -c "%s-%Y" "$REQ_FILE" 2>/dev/null || stat -f "%z-%m" "$REQ_FILE" 2>/dev/null || echo "no-hash")
fi

# Check if requirements hash matches to skip re-install
if [ -f "$HASH_FILE" ] && [ "$(cat "$HASH_FILE")" = "$REQ_HASH" ]; then
    log_success "Python dependencies are already up-to-date (cached)."
else
    log_info "Upgrading pip, setuptools, and wheel..."
    if ! "$VENV_PYTHON" -m pip install --upgrade pip setuptools wheel; then
        log_error "Failed to upgrade base packaging tools."
        exit 1
    fi

    log_info "Installing dependencies from requirements.txt..."
    if ! "$VENV_PYTHON" -m pip install -r "$REQ_FILE"; then
        log_error "Failed to install dependencies from requirements.txt."
        exit 1
    fi

    # Save the hash on success
    echo "$REQ_HASH" > "$HASH_FILE"
    log_success "Dependencies successfully installed and updated."
fi
