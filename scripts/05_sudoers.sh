#!/usr/bin/env bash
# Step 05: Setup Sudoers configuration for service management

set -Eeuo pipefail

# Locate and source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# This script needs root to write sudoers configuration
check_root

# Detect the real user who ran sudo
REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"
SUDOERS_FILE="/etc/sudoers.d/sack-counter"

log_info "Configuring sudoers permissions for user: ${REAL_USER}"

# Temp file for visudo verification
TEMP_SUDOERS=$(mktemp)
trap 'rm -f "$TEMP_SUDOERS"' EXIT

# Generate min-permission sudoers configuration
cat <<EOF > "$TEMP_SUDOERS"
# Sudoers configuration for Sack Counter Service management
${REAL_USER} ALL=(ALL) NOPASSWD: /usr/bin/systemctl start sack-counter, /usr/bin/systemctl stop sack-counter, /usr/bin/systemctl restart sack-counter, /usr/bin/systemctl status sack-counter, /usr/bin/systemctl reload sack-counter, /usr/bin/systemctl start sack-counter.service, /usr/bin/systemctl stop sack-counter.service, /usr/bin/systemctl restart sack-counter.service, /usr/bin/systemctl status sack-counter.service, /usr/bin/systemctl reload sack-counter.service
EOF

# Validate file using visudo
log_info "Validating configuration with visudo..."
if visudo -cf "$TEMP_SUDOERS"; then
    log_info "Validation successful. Installing sudoers configuration..."
    cp "$TEMP_SUDOERS" "$SUDOERS_FILE"
    chmod 0440 "$SUDOERS_FILE"
    log_success "Sudoers file successfully created at ${SUDOERS_FILE}"
    log_info "Permissions granted: ${REAL_USER} can manage 'sack-counter' service via systemctl without password prompts."
else
    log_error "Sudoers configuration validation failed. No changes were made."
    exit 1
fi
