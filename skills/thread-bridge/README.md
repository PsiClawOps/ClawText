thread-bridge OpenClaw Skill

Overview

thread-bridge provides three primary functions for Discord forum threads:
- refreshThread(sourceThreadId, options)
- splitThread(sourceThreadId, newTitle, forumChannelId, options)
- freshThread(forumChannelId, title, seedText, options)

Usage examples (called by agent code):

const tb = require('skills/thread-bridge');

await tb.refreshThread('1234567890', { messageCount: 150 });
await tb.splitThread('1234567890', 'RGCS Drift Fix', '1475021817168134144');
await tb.freshThread('1475021817168134144', 'New idea', 'Seed text...');

Notes
- Only allowed to create threads in the configured forum channel list.
- Archiving requires confirmArchive:true to avoid accidental closures.
- All operations are logged to memory/thread-bridge-log.jsonl
