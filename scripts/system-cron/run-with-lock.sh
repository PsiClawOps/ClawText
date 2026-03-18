#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: run-with-lock.sh <job-name> <timeout-seconds> <command...>" >&2
  exit 64
fi

JOB_NAME="$1"
TIMEOUT_SECONDS="$2"
shift 2

WORKSPACE="${HOME}/.openclaw/workspace"
STATE_ROOT="$WORKSPACE/state/clawtext/prod"
LOG_DIR="$STATE_ROOT/logs"
LOCK_DIR="$STATE_ROOT/locks"
STATUS_DIR="$STATE_ROOT/run-status"
LOCK_FILE="$LOCK_DIR/${JOB_NAME}.lock"
LOG_FILE="$LOG_DIR/${JOB_NAME}.log"
STATUS_FILE="$STATUS_DIR/${JOB_NAME}.json"

mkdir -p "$LOG_DIR" "$LOCK_DIR" "$STATUS_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"job":"%s","startedAt":"%s","ok":false,"reason":"lock-busy"}\n' "$JOB_NAME" "$ts" > "$STATUS_FILE"
  echo "[$ts] SKIP $JOB_NAME lock busy" >> "$LOG_FILE"
  exit 75
fi

START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_MS="$(python3 - <<'PY'
import time
print(int(time.time()*1000))
PY
)"

echo "[$START_ISO] START $JOB_NAME" >> "$LOG_FILE"
set +e
timeout --signal=TERM "$TIMEOUT_SECONDS" "$@" >> "$LOG_FILE" 2>&1
RC=$?
set -e

END_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
END_MS="$(python3 - <<'PY'
import time
print(int(time.time()*1000))
PY
)"
DURATION_MS=$((END_MS - START_MS))

if [[ "$RC" -eq 0 ]]; then
  OK=true
  echo "[$END_ISO] END $JOB_NAME rc=0 durationMs=$DURATION_MS" >> "$LOG_FILE"
else
  OK=false
  echo "[$END_ISO] END $JOB_NAME rc=$RC durationMs=$DURATION_MS" >> "$LOG_FILE"
fi

printf '{"job":"%s","startedAt":"%s","endedAt":"%s","durationMs":%s,"ok":%s,"exitCode":%s}\n' \
  "$JOB_NAME" "$START_ISO" "$END_ISO" "$DURATION_MS" "$OK" "$RC" > "$STATUS_FILE"

exit "$RC"
