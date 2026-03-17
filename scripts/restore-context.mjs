#!/usr/bin/env node
/**
 * restore-context.mjs
 *
 * Reads from the permanent journal to reconstruct conversation context
 * for a given channel/thread — without needing Discord API, a bot token,
 * or a live session file.
 *
 * This is the recovery path when a session file is lost, corrupted, or reset.
 *
 * Usage:
 *   node scripts/restore-context.mjs --channel <channelId> [options]
 *
 * Options:
 *   --channel <id>     Channel/thread ID to restore (required)
 *   --limit <n>        Max messages to return (default: 50)
 *   --days <n>         How many days back to search journal files (default: 7)
 *   --format <type>    Output format: summary | full | inject (default: summary)
 *   --out <file>       Write output to file instead of stdout
 *
 * Formats:
 *   summary  — Human-readable conversation recap, most recent messages first
 *   full     — All raw journal records as JSONL
 *   inject   — Formatted for direct injection into session context
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');

// ── CLI arg parsing ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.channel) {
  console.error('Usage: node restore-context.mjs --channel <channelId> [--limit 50] [--days 7] [--format summary|full|inject] [--out file]');
  process.exit(1);
}

const CHANNEL = String(args.channel);
const LIMIT = parseInt(args.limit || '50', 10);
const DAYS = parseInt(args.days || '7', 10);
const FORMAT = args.format || 'summary';
const OUT_FILE = args.out || null;

// ── Find journal files within range ──────────────────────────────────────────
function getJournalFilesForRange(days) {
  if (!fs.existsSync(JOURNAL_DIR)) return [];
  const files = fs.readdirSync(JOURNAL_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.jsonl$/))
    .sort()
    .reverse(); // newest first

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return files
    .filter(f => f.slice(0, 10) >= cutoffStr)
    .map(f => path.join(JOURNAL_DIR, f));
}

// ── Read and filter records ───────────────────────────────────────────────────
function readRecordsForChannel(files, channelId, limit) {
  const allRecords = [];

  for (const file of files) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }

    const lines = raw.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (rec.channel === channelId || rec.conversationId === channelId) {
          allRecords.push(rec);
        }
      } catch { /* skip malformed */ }
    }
  }

  // Sort oldest→newest
  allRecords.sort((a, b) => a.ts - b.ts);

  // If there are checkpoints, find the most recent one and return
  // only messages AFTER it — that's the current session context
  const checkpoints = allRecords.filter(r => r.type === 'checkpoint');
  const lastCheckpoint = checkpoints[checkpoints.length - 1];

  let records = allRecords;
  if (lastCheckpoint) {
    const afterCheckpoint = allRecords.filter(r => r.ts > lastCheckpoint.ts && r.type !== 'checkpoint');
    // If there's meaningful content after the last checkpoint, use just that
    // Otherwise fall back to all records (checkpoint may have just been written)
    if (afterCheckpoint.length >= 3) {
      records = afterCheckpoint;
    }
  }

  return records.slice(-limit);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function formatSummary(records, channelId) {
  if (records.length === 0) {
    return `No journal entries found for channel ${channelId} in the last ${DAYS} days.\n\nThis means either:\n  1. The journal was set up after this conversation started\n  2. The channel ID is incorrect\n  3. The journal files were pruned or lost\n`;
  }

  const first = new Date(records[0].ts).toISOString();
  const last = new Date(records[records.length - 1].ts).toISOString();
  const threadName = records.find(r => r.threadName)?.threadName || channelId;

  const lines = [
    `# Context Restore — ${threadName}`,
    `Channel: ${channelId}`,
    `Restored: ${records.length} messages (${first} → ${last})`,
    ``,
    `---`,
    ``,
  ];

  for (const rec of records) {
    const time = new Date(rec.ts).toISOString().replace('T', ' ').slice(0, 16);
    const arrow = rec.dir === 'in' ? '→' : '←';
    const who = rec.sender || rec.from || (rec.dir === 'in' ? 'user' : 'agent');
    const preview = rec.content.length > 500
      ? rec.content.slice(0, 500) + '…'
      : rec.content;
    lines.push(`**[${time}] ${arrow} ${who}:**`);
    lines.push(preview);
    lines.push('');
  }

  return lines.join('\n');
}

function formatInject(records, channelId) {
  if (records.length === 0) {
    return `[context-restore: no journal entries found for channel ${channelId}]`;
  }

  const threadName = records.find(r => r.threadName)?.threadName || channelId;
  const lines = [
    `[CONTEXT RESTORE — journal replay for: ${threadName}]`,
    `[channel: ${channelId} | messages: ${records.length} | source: journal]`,
    ``,
  ];

  for (const rec of records) {
    const time = new Date(rec.ts).toISOString().replace('T', ' ').slice(0, 16);
    const role = rec.dir === 'in' ? 'USER' : 'AGENT';
    const who = rec.sender || rec.from || role;
    lines.push(`[${time}] [${role}] ${who}: ${rec.content}`);
  }

  lines.push('');
  lines.push('[END CONTEXT RESTORE]');
  return lines.join('\n');
}

function formatFull(records) {
  return records.map(r => JSON.stringify(r)).join('\n') + '\n';
}

// ── Main ──────────────────────────────────────────────────────────────────────
const files = getJournalFilesForRange(DAYS);

if (files.length === 0) {
  console.error(`[restore-context] No journal files found in ${JOURNAL_DIR} for the last ${DAYS} days.`);
  console.error('Journal may not be set up yet or no messages have been recorded.');
  process.exit(1);
}

const records = readRecordsForChannel(files, CHANNEL, LIMIT);

let output;
switch (FORMAT) {
  case 'full':   output = formatFull(records); break;
  case 'inject': output = formatInject(records, CHANNEL); break;
  default:       output = formatSummary(records, CHANNEL); break;
}

if (OUT_FILE) {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, output, 'utf8');
  console.log(`[restore-context] Written to ${OUT_FILE} (${records.length} messages)`);
} else {
  process.stdout.write(output);
}
