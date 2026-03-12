# ClawBridge Quickstart

## 1) Check CLI works

```bash
node ~/.openclaw/workspace/skills/clawbridge/bin/clawbridge.js help
```

Optional global command:

```bash
cd ~/.openclaw/workspace/skills/clawbridge
npm link
clawbridge help
```

## 2) Run an extract to a forum channel

```bash
clawbridge extract-discord-thread \
  --source-thread 1480315446694641664 \
  --target-forum 1475021817168134144 \
  --title "ClawBridge Extract — Test" \
  --mode dual
```

## 3) Add manual quality context (recommended)

```bash
clawbridge extract-discord-thread \
  --source-thread 1480315446694641664 \
  --target-forum 1475021817168134144 \
  --title "ClawBridge Extract — Curated" \
  --mode dual \
  --objective "Transfer architecture continuity into ClawDash lane" \
  --established "ClawDash is control surface" \
  --established "ClawTask is core pillar" \
  --open "Finalize ClawTask schema" \
  --next "Seed Milestone 1 board cards"
```

## 4) Optional memory promotion

```bash
clawbridge extract-discord-thread \
  --source-thread 1480315446694641664 \
  --target-forum 1475021817168134144 \
  --title "ClawBridge Extract — Durable" \
  --mode dual \
  --ingest \
  --project clawbridge \
  --source docs:clawbridge-auto
```

## Result

You get:
- short handoff summary
- full continuity packet
- next-agent bootstrap
- new destination forum thread with posted artifacts
- optional ClawText promotion
