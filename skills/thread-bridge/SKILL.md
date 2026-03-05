name: thread-bridge
version: 0.1.0
description: "Controlled cross-thread operations for Discord forum channels: refresh, split, and fresh thread creation while preserving per-thread session isolation."
author: OpenClaw Subagent
entry: index.js
commands: []
exports:
  - refreshThread
  - splitThread
  - freshThread
permissions:
  - channels.discord
  - memory.core
