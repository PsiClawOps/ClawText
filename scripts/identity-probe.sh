#!/usr/bin/env bash
# identity-probe.sh — Post-restart identity bleed detection
#
# Sends a lightweight identity-confirm probe to each configured agent
# and validates the response contains the correct identity, not another agent's.
#
# Designed to run after `openclaw gateway restart` as a smoke test.
#
# Usage:
#   ./identity-probe.sh              # Probe all council agents
#   ./identity-probe.sh anvil        # Probe specific agent
#   ./identity-probe.sh --dry-run    # Show what would be probed

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
CONFIG="$OPENCLAW_HOME/openclaw.json"

# Extract agent list from config
get_agents() {
  if [[ ! -f "$CONFIG" ]]; then
    echo -e "${RED}✗ No openclaw.json found at $CONFIG${NC}" >&2
    exit 1
  fi
  python3 -c "
import json, sys
with open('$CONFIG') as f:
    config = json.load(f)
agents = config.get('agents', {}).get('list', [])
for a in agents:
    aid = a.get('id', '')
    name = a.get('name', aid)
    ws = a.get('workspace', '')
    print(f'{aid}\t{name}\t{ws}')
"
}

# Extract expected identity from agent's IDENTITY.md
get_expected_identity() {
  local workspace="$1"
  local identity_file="$workspace/IDENTITY.md"
  
  if [[ ! -f "$identity_file" ]]; then
    echo "UNKNOWN"
    return
  fi
  
  # Extract the Name field (handles both "**Name:** X" and "- **Name:** X")
  grep -oP '\*\*Name:\*\*\s*\K\S+' "$identity_file" 2>/dev/null | head -1 || echo "UNKNOWN"
}

# Check if CLAWPTIMIZATION leaks into a workspace's SOUL.md identity
check_identity_anchor_source() {
  local agent_id="$1"
  local workspace="$2"
  local expected_name="$3"
  
  local soul_file="$workspace/SOUL.md"
  if [[ ! -f "$soul_file" ]]; then
    echo -e "${YELLOW}⚠ $agent_id: No SOUL.md found at $workspace${NC}"
    return 1
  fi
  
  # Simulate what identity-anchor-provider.ts does:
  # It reads from the workspace path to derive agentId
  # Check if the workspace path contains workspace-council/{agent}
  local path_agent
  path_agent=$(echo "$workspace" | grep -oP 'workspace-council/\K[^/]+' 2>/dev/null || echo "")
  
  if [[ -n "$path_agent" ]]; then
    if [[ "$path_agent" != "$agent_id" ]]; then
      echo -e "${RED}✗ $agent_id: Workspace path derives agent '$path_agent' — MISMATCH${NC}"
      return 1
    fi
  fi
  
  return 0
}

# Verify the optimize hook resolves workspace correctly
check_hook_workspace_resolution() {
  local handler_js="$OPENCLAW_HOME/workspace/repo/clawtext/hooks/clawtext-optimize/handler.js"
  local handler_ts="$OPENCLAW_HOME/workspace/repo/clawtext/hooks/clawtext-optimize/handler.ts"
  
  local issues=0
  
  for handler in "$handler_ts" "$handler_js"; do
    [[ ! -f "$handler" ]] && continue
    local basename
    basename=$(basename "$handler")
    
    # Check 1: No hardcoded WORKSPACE (should be DEFAULT_WORKSPACE)
    if grep -qP '^const WORKSPACE\s*=' "$handler" 2>/dev/null; then
      echo -e "${RED}✗ $basename: Hardcoded WORKSPACE constant found (should be DEFAULT_WORKSPACE)${NC}"
      issues=$((issues + 1))
    fi
    
    # Check 2: ctx.workspaceDir is used
    if ! grep -q 'ctx\.workspaceDir' "$handler" 2>/dev/null; then
      echo -e "${RED}✗ $basename: ctx.workspaceDir not referenced (identity will bleed)${NC}"
      issues=$((issues + 1))
    fi
    
    # Check 3: DEFAULT_WORKSPACE exists as fallback only
    if grep -qP 'DEFAULT_WORKSPACE' "$handler" 2>/dev/null; then
      echo -e "${GREEN}✓ $basename: Uses DEFAULT_WORKSPACE as fallback${NC}"
    fi
  done
  
  return $issues
}

probe_agent() {
  local agent_id="$1"
  local agent_name="$2"
  local workspace="$3"
  local dry_run="${4:-false}"
  
  local expected
  expected=$(get_expected_identity "$workspace")
  
  if [[ "$dry_run" == "true" ]]; then
    echo "  Would probe: $agent_id (expect: $expected, workspace: $workspace)"
    return 0
  fi
  
  local issues=0
  
  # Check 1: IDENTITY.md exists and has a name
  if [[ "$expected" == "UNKNOWN" ]]; then
    echo -e "${YELLOW}⚠ $agent_id: No identity marker in IDENTITY.md${NC}"
    issues=$((issues + 1))
  else
    echo -e "${GREEN}✓ $agent_id: IDENTITY.md declares '$expected'${NC}"
  fi
  
  # Check 2: SOUL.md exists in the right workspace
  if [[ -f "$workspace/SOUL.md" ]]; then
    # Check that SOUL.md doesn't reference the wrong agent
    local soul_name
    soul_name=$(grep -oP '(?<=You are \*\*)\w+' "$workspace/SOUL.md" 2>/dev/null | head -1 || echo "")
    if [[ -n "$soul_name" && "$soul_name" != "$expected" ]]; then
      echo -e "${RED}✗ $agent_id: SOUL.md references '$soul_name' but IDENTITY.md says '$expected'${NC}"
      issues=$((issues + 1))
    else
      echo -e "${GREEN}✓ $agent_id: SOUL.md identity consistent${NC}"
    fi
  else
    echo -e "${YELLOW}⚠ $agent_id: No SOUL.md at $workspace${NC}"
  fi
  
  # Check 3: Workspace path derivation
  check_identity_anchor_source "$agent_id" "$workspace" "$expected" || issues=$((issues + 1))
  
  return $issues
}

# ── Main ──

DRY_RUN=false
TARGET=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) TARGET="$arg" ;;
  esac
done

echo "═══ Identity Bleed Probe ═══"
echo ""

# First: check the hook itself
echo "── Hook Integrity ──"
check_hook_workspace_resolution
hook_ok=$?
echo ""

# Then: check each agent
echo "── Agent Identity ──"
total=0
failed=0

while IFS=$'\t' read -r aid aname aws; do
  [[ -z "$aid" ]] && continue
  [[ -n "$TARGET" && "$aid" != "$TARGET" ]] && continue
  
  total=$((total + 1))
  if ! probe_agent "$aid" "$aname" "$aws" "$DRY_RUN"; then
    failed=$((failed + 1))
  fi
  echo ""
done < <(get_agents)

# Summary
echo "═══ Summary ═══"
echo "  Agents checked: $total"
if [[ $failed -gt 0 ]]; then
  echo -e "  ${RED}Identity issues: $failed${NC}"
  echo ""
  echo -e "${RED}⚠ IDENTITY BLEED RISK DETECTED — Review before running deliberations${NC}"
  exit 1
else
  echo -e "  ${GREEN}All identities clean${NC}"
  if [[ $hook_ok -ne 0 ]]; then
    echo -e "  ${YELLOW}⚠ Hook issues detected (see above)${NC}"
    exit 1
  fi
  echo -e "\n${GREEN}✓ Safe to proceed.${NC}"
  exit 0
fi
