# ClawText System Cron Migration Runbook

**Date:** 2026-03-18  
**Scope:** ClawText only  
**Status:** Active

## What moved off OpenClaw agent-cron

The following deterministic maintenance jobs now run via **user systemd timers** instead of OpenClaw agent turns:

| Job | Old scheduler | New scheduler | Cadence |
|---|---|---|---|
| `clawtext-extract-buffer` | OpenClaw cron | `clawtext-extract-buffer.timer` | every 20m |
| `clawtext-daily-cluster-rebuild` | OpenClaw cron | `clawtext-daily-cluster-rebuild.timer` | daily 02:00 UTC |
| `clawtext-operational-maintenance` | OpenClaw cron | `clawtext-operational-maintenance.timer` | Sunday 03:00 UTC |

## Why

These jobs are pure deterministic script execution:
- no LLM reasoning needed
- no user-facing delivery required
- lower cost and less scheduler coupling than agent-turn cron

## Installed wrapper scripts

Repo path:
- `scripts/system-cron/run-with-lock.sh`
- `scripts/system-cron/clawtext-extract-buffer.sh`
- `scripts/system-cron/clawtext-daily-cluster-rebuild.sh`
- `scripts/system-cron/clawtext-operational-maintenance.sh`

Behavior:
- lockfile/no-overlap via `flock`
- timeout per job
- append-only logs
- per-job JSON status file

## Installed user units

Repo templates:
- `ops/systemd/user/clawtext-extract-buffer.service`
- `ops/systemd/user/clawtext-extract-buffer.timer`
- `ops/systemd/user/clawtext-daily-cluster-rebuild.service`
- `ops/systemd/user/clawtext-daily-cluster-rebuild.timer`
- `ops/systemd/user/clawtext-operational-maintenance.service`
- `ops/systemd/user/clawtext-operational-maintenance.timer`

Active install location:
- `~/.config/systemd/user/`

## Runtime state / logs

All scheduler artifacts live under:
- `state/clawtext/prod/logs/`
- `state/clawtext/prod/locks/`
- `state/clawtext/prod/run-status/`

Expected files:
- `logs/clawtext-extract-buffer.log`
- `logs/clawtext-daily-cluster-rebuild.log`
- `logs/clawtext-operational-maintenance.log`
- `run-status/<job>.json`

## Current model policy for any remaining ClawText agent-turn cron

The remaining fallback OpenClaw cron job (`clawtext-journal-commit`, currently disabled) now uses:
- `model: mini`

This maps to GPT-5.4-mini in the current OpenClaw model alias policy.

## Verification commands

```bash
systemctl --user list-timers --all 'clawtext-*' --no-pager
systemctl --user status clawtext-extract-buffer.timer
systemctl --user status clawtext-daily-cluster-rebuild.timer
systemctl --user status clawtext-operational-maintenance.timer

cat ~/.openclaw/workspace/state/clawtext/prod/run-status/clawtext-extract-buffer.json
cat ~/.openclaw/workspace/state/clawtext/prod/run-status/clawtext-daily-cluster-rebuild.json
cat ~/.openclaw/workspace/state/clawtext/prod/run-status/clawtext-operational-maintenance.json
```

Manual runs:

```bash
systemctl --user start clawtext-extract-buffer.service
systemctl --user start clawtext-daily-cluster-rebuild.service
systemctl --user start clawtext-operational-maintenance.service
```

## Rollback

OpenClaw cron jobs were disabled, not deleted.

Rollback steps:
1. Disable user timers:
   ```bash
   systemctl --user disable --now clawtext-extract-buffer.timer clawtext-daily-cluster-rebuild.timer clawtext-operational-maintenance.timer
   ```
2. Re-enable the prior OpenClaw jobs:
   - `40f47683-0d90-4deb-ad06-5dac45e8de80` (`clawtext-extract-buffer`)
   - `42be7486-c8dd-4f8b-b633-aa37b941a164` (`clawtext-daily-cluster-rebuild`)
   - `1be4f0f1-9bb4-4ac7-89f9-b5f9cda730d0` (`clawtext-operational-maintenance`)
3. Confirm in `openclaw cron list`

## Notes

- `clawtext-extract-buffer` was intentionally tightened from **30m → 20m**.
- `15m` was not adopted yet; current queue depth and lag do not justify it.
- Alerting is currently log/status-file based. If needed later, add a separate deterministic watchdog that reads `run-status/*.json` and publishes alerts.
