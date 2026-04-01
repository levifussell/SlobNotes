#!/usr/bin/env bash
set -e

SITE_PASSWORD_SLUNK_SYSTEMS="" \
  SITE_PASSWORD_MINE="CHANGE_ME" \
  python3 "$(dirname "$0")/build_sources.py"
