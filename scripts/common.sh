#!/usr/bin/env bash
# Common shared functions and variables for deployment scripts

# Text formatting colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0;37m' # No Color

# Print informational message
log_info() {
    echo -e "${BLUE}${BOLD}[INFO]${NC} $1"
}

# Print success message
log_success() {
    echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"
}

# Print warning message
log_warning() {
    echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"
}

# Print error message and details
log_error() {
    echo -e "${RED}${BOLD}[ERROR]${NC} $1" >&2
}

# Check if a command is available on the system
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Command '$1' is required but not found. Please install it."
        return 1
    fi
    return 0
}

# Assert script is run as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (using sudo)."
        exit 1
    fi
}

# Detect and return the project root directory
get_project_root() {
    # Resolve the absolute path of the directory where this script is located
    local source_dir
    source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    # Since common.sh is in scripts/, the project root is one level up
    local root_dir
    root_dir="$(cd "${source_dir}/.." && pwd)"
    echo "$root_dir"
}
