#!/usr/bin/env bash
# architecture-watchdog.sh — Detect unexpected changes to load-bearing files
#
# Run after upgrades or on gateway restart.
# Compares current file hashes against a known-good manifest.
# Exit 0 = clean, Exit 1 = drift detected (review required).
#
# Usage:
#   ./architecture-watchdog.sh check    # Compare against manifest
#   ./architecture-watchdog.sh stamp    # Update manifest to current state (after review)
#   ./architecture-watchdog.sh diff     # Show what changed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/.architecture-manifest.sha256"

# ── Critical files to monitor ──
# These are the load-bearing files where a silent change can break multi-agent
# identity isolation, context composition, or governance mechanics.
WATCHED_FILES=(
  "hooks/clawtext-optimize/handler.ts"
  "hooks/clawtext-optimize/handler.js"
  "src/agent-identity.ts"
  "src/slots/identity-anchor-provider.ts"
  "src/clawptimization.ts"
  "src/prompt-compositor.ts"
  "src/injected-context.ts"
)

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

stamp() {
  echo "# architecture-watchdog manifest — $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$MANIFEST"
  echo "# Review changes before running 'stamp' to accept them." >> "$MANIFEST"
  echo "#" >> "$MANIFEST"
  
  local count=0
  for f in "${WATCHED_FILES[@]}"; do
    local full="$REPO_ROOT/$f"
    if [[ -f "$full" ]]; then
      sha256sum "$full" | sed "s|$REPO_ROOT/||" >> "$MANIFEST"
      count=$((count + 1))
    else
      echo "# MISSING: $f" >> "$MANIFEST"
    fi
  done
  
  echo -e "${GREEN}✓ Manifest stamped with $count files${NC}"
  echo "  $MANIFEST"
}

check() {
  if [[ ! -f "$MANIFEST" ]]; then
    echo -e "${YELLOW}⚠ No manifest found. Run '$0 stamp' after reviewing current state.${NC}"
    exit 1
  fi

  local drift=0
  local missing=0
  local clean=0

  while IFS= read -r line; do
    # Skip comments
    [[ "$line" =~ ^# ]] && continue
    [[ -z "$line" ]] && continue

    local expected_hash
    local file_path
    expected_hash=$(echo "$line" | awk '{print $1}')
    file_path=$(echo "$line" | awk '{print $2}')
    
    local full="$REPO_ROOT/$file_path"
    
    if [[ ! -f "$full" ]]; then
      echo -e "${RED}✗ MISSING: $file_path${NC}"
      missing=$((missing + 1))
      continue
    fi

    local current_hash
    current_hash=$(sha256sum "$full" | awk '{print $1}')

    if [[ "$current_hash" != "$expected_hash" ]]; then
      echo -e "${RED}✗ CHANGED: $file_path${NC}"
      drift=$((drift + 1))
    else
      echo -e "${GREEN}✓ OK:      $file_path${NC}"
      clean=$((clean + 1))
    fi
  done < "$MANIFEST"

  echo ""
  echo "── Summary ──"
  echo -e "  Clean:   ${GREEN}$clean${NC}"
  [[ $drift -gt 0 ]] && echo -e "  Changed: ${RED}$drift${NC}"
  [[ $missing -gt 0 ]] && echo -e "  Missing: ${RED}$missing${NC}"

  if [[ $drift -gt 0 || $missing -gt 0 ]]; then
    echo ""
    echo -e "${RED}⚠ ARCHITECTURE DRIFT DETECTED${NC}"
    echo "  Review changes, then run '$0 stamp' to accept."
    echo "  Run '$0 diff' to see what changed."
    exit 1
  fi

  echo -e "\n${GREEN}✓ All watched files match manifest.${NC}"
  exit 0
}

show_diff() {
  if [[ ! -f "$MANIFEST" ]]; then
    echo -e "${YELLOW}⚠ No manifest to diff against.${NC}"
    exit 1
  fi

  while IFS= read -r line; do
    [[ "$line" =~ ^# ]] && continue
    [[ -z "$line" ]] && continue

    local expected_hash
    local file_path
    expected_hash=$(echo "$line" | awk '{print $1}')
    file_path=$(echo "$line" | awk '{print $2}')
    local full="$REPO_ROOT/$file_path"

    if [[ ! -f "$full" ]]; then
      echo -e "${RED}── $file_path: DELETED ──${NC}"
      continue
    fi

    local current_hash
    current_hash=$(sha256sum "$full" | awk '{print $1}')

    if [[ "$current_hash" != "$expected_hash" ]]; then
      echo -e "${YELLOW}── $file_path: CHANGED ──${NC}"
      # If git is available, show the diff
      if command -v git &>/dev/null && git -C "$REPO_ROOT" rev-parse --git-dir &>/dev/null; then
        git -C "$REPO_ROOT" diff -- "$file_path" 2>/dev/null || echo "  (git diff unavailable)"
      else
        echo "  Hash was: $expected_hash"
        echo "  Hash now: $current_hash"
      fi
      echo ""
    fi
  done < "$MANIFEST"
}

case "${1:-help}" in
  stamp)  stamp ;;
  check)  check ;;
  diff)   show_diff ;;
  *)
    echo "Usage: $0 {check|stamp|diff}"
    echo ""
    echo "  check  — Compare files against known-good manifest"
    echo "  stamp  — Accept current state as known-good (after review)"
    echo "  diff   — Show what changed since last stamp"
    ;;
esac
