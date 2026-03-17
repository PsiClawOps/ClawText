#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

const JOURNAL_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'journal');
const SCAN_DAYS = 2;
const ACK_SET = new Set([
  'ok',
  'okay',
  'yes',
  'sounds good',
  'lets do it',
  "let's do it",
  'great',
  'thanks',
  'thank you',
  'done',
  'sgtm',
]);

function parseArgs(argv) {
  const out = { hours: 4, exclude: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--hours' && argv[i + 1]) {
      out.hours = Math.max(1, Number(argv[++i]) || 4);
    } else if (arg === '--exclude' && argv[i + 1]) {
      out.exclude = String(argv[++i]);
    }
  }
  return out;
}

function asTs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const d = Date.parse(value);
    if (Number.isFinite(d)) return d;
  }
  return null;
}

function readRecentRecords() {
  if (!fs.existsSync(JOURNAL_DIR)) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SCAN_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const files = fs
    .readdirSync(JOURNAL_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(0, 10) >= cutoffDate)
    .sort();

  const records = [];
  for (const name of files) {
    const full = path.join(JOURNAL_DIR, name);
    let data = '';
    try {
      data = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    for (const line of data.split('\n').filter(Boolean)) {
      try {
        records.push(JSON.parse(line));
      } catch {
        // skip bad line
      }
    }
  }

  return records;
}

function channelId(rec) {
  return String(rec.channel || rec.channelId || rec.conversationId || '').trim();
}

function isAck(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[.!?]+$/g, '');
  if (!normalized) return true;
  if (ACK_SET.has(normalized)) return true;
  if (normalized.length <= 20 && /^(ok|k|yes|yep|sure|done|thanks)\b/.test(normalized)) return true;
  return false;
}

function topicHint(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'active discussion';
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 80).trimEnd()}…`;
}

function sender(rec) {
  if (typeof rec.sender === 'string' && rec.sender.trim()) return rec.sender.trim();
  if (typeof rec.from === 'string' && rec.from.trim()) return rec.from.trim();
  if (String(rec.dir || '').toLowerCase() === 'in') return 'user';
  if (String(rec.dir || '').toLowerCase() === 'out') return 'agent';
  return 'unknown';
}

function ago(ts) {
  const delta = Math.max(0, Date.now() - ts);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildEntries(records, staleHours, exclude) {
  const staleMs = staleHours * 60 * 60 * 1000;
  const byChannel = new Map();

  for (const rec of records) {
    const id = channelId(rec);
    if (!id) continue;
    if (exclude && id === exclude) continue;
    const bucket = byChannel.get(id) || [];
    bucket.push(rec);
    byChannel.set(id, bucket);
  }

  const out = [];
  for (const [id, items] of byChannel.entries()) {
    const sorted = [...items].sort((a, b) => (asTs(a.ts) || 0) - (asTs(b.ts) || 0));
    const latest = [...sorted].reverse().find((rec) => String(rec.type || '').toLowerCase() !== 'checkpoint' && asTs(rec.ts));
    if (!latest) continue;

    const lastTs = asTs(latest.ts);
    if (!lastTs) continue;
    if (Date.now() - lastTs > staleMs) continue;

    const topicRec = [...sorted].reverse().find((rec) => {
      if (String(rec.type || '').toLowerCase() === 'checkpoint') return false;
      const content = String(rec.content || '');
      return content.trim().length > 50 && !isAck(content);
    });

    const threadName = [...sorted].reverse().find((rec) => typeof rec.threadName === 'string' && rec.threadName.trim())?.threadName || id;
    const name = String(threadName).replace(/^#/, '');
    const topic = topicRec ? topicHint(topicRec.content) : 'active discussion';
    const score = Math.exp(-Math.max(0, Date.now() - lastTs) / staleMs);

    out.push({
      id,
      name,
      topic,
      sender: sender(latest),
      lastTs,
      score,
    });
  }

  return out.sort((a, b) => b.score - a.score || b.lastTs - a.lastTs);
}

function formatBlock(entries) {
  return [
    '<!-- Cross-session awareness (auto-generated) -->',
    'Active threads (recent):',
    ...entries.map((entry) => `  • #${entry.name}: ${entry.topic}, ${entry.sender}, ${ago(entry.lastTs)}`),
    '<!-- End cross-session awareness -->',
  ].join('\n');
}

const args = parseArgs(process.argv.slice(2));
const records = readRecentRecords();
const entries = buildEntries(records, args.hours, args.exclude);

console.log('Cross-session status');
console.log(`journal: ${JOURNAL_DIR}`);
console.log(`scan window: last ${SCAN_DAYS} day(s)`);
console.log(`active threshold: ${args.hours}h`);
if (args.exclude) console.log(`excluded channel: ${args.exclude}`);
console.log('');

if (entries.length === 0) {
  console.log('No active external channels found.');
  process.exit(0);
}

console.log('Active channels:');
for (const entry of entries) {
  console.log(`- #${entry.name} (${entry.id})`);
  console.log(`  topic: ${entry.topic}`);
  console.log(`  sender: ${entry.sender}`);
  console.log(`  last activity: ${new Date(entry.lastTs).toISOString()} (${ago(entry.lastTs)})`);
  console.log(`  freshness score: ${entry.score.toFixed(3)}`);
}

console.log('');
console.log('Awareness block:');
console.log(formatBlock(entries));
