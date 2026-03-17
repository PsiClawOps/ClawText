#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');
const STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod');
const PREFETCH_STATE_PATH = path.join(STATE_DIR, 'prefetch-state.json');
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const BOT_USER_ID = '1474998261575061554';
const STALE_MS = 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    channelsFile: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--channels-file') args.channelsFile = argv[i + 1] || null, i += 1;
  }

  return args;
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadOpenClawConfig() {
  return readJsonFile(OPENCLAW_CONFIG_PATH) || {};
}

function loadDiscordToken(config) {
  const cfg = config || loadOpenClawConfig();
  return (
    cfg?.channels?.discord?.token ||
    cfg?.secrets?.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_BOT_TOKEN ||
    null
  );
}

function readState() {
  return readJsonFile(PREFETCH_STATE_PATH);
}

export function isPrefetchStateStale(nowMs = Date.now()) {
  const state = readState();
  if (!state || typeof state.timestamp !== 'number') return true;
  return nowMs - state.timestamp > STALE_MS;
}

function discoverChannelsFromConfig(argsChannelsFile, config) {
  const channels = new Set();

  const add = (value) => {
    const id = String(value || '').trim();
    if (/^\d+$/.test(id)) channels.add(id);
  };

  if (argsChannelsFile && fs.existsSync(argsChannelsFile)) {
    try {
      const raw = fs.readFileSync(argsChannelsFile, 'utf8').trim();
      if (raw.startsWith('[') || raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.channels) ? parsed.channels : [];
        for (const item of list) add(typeof item === 'object' ? item?.id : item);
      } else {
        for (const part of raw.split(/[\n,\s]+/g)) add(part);
      }
    } catch {
      // ignore malformed channels file
    }
  }

  const cfg = config || {};
  const prefetchChannels = cfg?.channels?.discord?.prefetchChannels;
  if (Array.isArray(prefetchChannels)) {
    for (const entry of prefetchChannels) add(typeof entry === 'object' ? entry?.id : entry);
  }

  const discordChannels = cfg?.channels?.discord?.channels;
  if (Array.isArray(discordChannels)) {
    for (const entry of discordChannels) add(typeof entry === 'object' ? entry?.id : entry);
  }

  return [...channels];
}

function discoverChannelsFromJournal(nowMs = Date.now()) {
  const channels = new Set();
  if (!fs.existsSync(JOURNAL_DIR)) return [];

  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  const files = fs
    .readdirSync(JOURNAL_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .slice(-2);

  for (const file of files) {
    const fullPath = path.join(JOURNAL_DIR, file);
    let raw = '';
    try {
      raw = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        const ts = Number(record?.ts || 0);
        if (ts && ts < cutoff) continue;
        const channel = String(record?.channel || '').trim();
        if (/^\d+$/.test(channel)) channels.add(channel);
      } catch {
        // ignore malformed lines
      }
    }
  }

  return [...channels];
}

function loadExistingDiscordMessageIds() {
  const ids = new Set();
  if (!fs.existsSync(JOURNAL_DIR)) return ids;

  const files = fs.readdirSync(JOURNAL_DIR).filter((f) => f.endsWith('.jsonl')).sort();
  for (const file of files) {
    const fullPath = path.join(JOURNAL_DIR, file);
    let raw = '';
    try {
      raw = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (typeof rec?.discordMessageId === 'string' && rec.discordMessageId) {
          ids.add(rec.discordMessageId);
        }
      } catch {
        // ignore malformed lines
      }
    }
  }

  return ids;
}

async function fetchChannelMessages(channelId, token) {
  const url = `${DISCORD_API_BASE}/channels/${channelId}/messages?limit=50`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${res.status} for channel ${channelId}: ${text}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function toJournalRecord(message, channelId) {
  const ts = new Date(message.timestamp || Date.now()).getTime();
  const senderId = String(message?.author?.id || '');
  const sender = String(message?.author?.username || 'unknown');
  const content = String(message?.content || '');

  return {
    type: 'discord_prefetch',
    ts,
    iso: new Date(ts).toISOString(),
    channel: String(channelId),
    sender,
    senderId,
    content,
    discordMessageId: String(message?.id || ''),
    dir: senderId === BOT_USER_ID ? 'out' : 'in',
    source: 'discord-prefetch',
  };
}

function appendRecordsToJournal(records) {
  if (!records.length) return;
  if (!fs.existsSync(JOURNAL_DIR)) fs.mkdirSync(JOURNAL_DIR, { recursive: true });

  const byDate = new Map();
  for (const rec of records) {
    const date = new Date(rec.ts).toISOString().slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(rec);
  }

  for (const [date, group] of byDate.entries()) {
    const file = path.join(JOURNAL_DIR, `${date}.jsonl`);
    const lines = group.map((rec) => JSON.stringify(rec)).join('\n') + '\n';
    fs.appendFileSync(file, lines, 'utf8');
  }
}

function writePrefetchState(state) {
  ensureDirFor(PREFETCH_STATE_PATH);
  fs.writeFileSync(PREFETCH_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

export async function runPrefetch(options = {}) {
  const nowMs = Date.now();
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const argsChannelsFile = options.channelsFile || null;
  const logger = typeof options.logger === 'function' ? options.logger : console.log;

  if (!dryRun && !force && !isPrefetchStateStale(nowMs)) {
    logger('[discord-prefetch] state is fresh (<1h), skipping prefetch');
    return { skipped: true, reason: 'fresh-state' };
  }

  const config = loadOpenClawConfig();
  const configChannels = discoverChannelsFromConfig(argsChannelsFile, config);
  const channels = configChannels.length > 0 ? configChannels : discoverChannelsFromJournal(nowMs);

  if (channels.length === 0) {
    logger('[discord-prefetch] no channels discovered; nothing to prefetch');
    if (!dryRun) {
      writePrefetchState({
        timestamp: nowMs,
        iso: new Date(nowMs).toISOString(),
        channelsPrefetched: [],
        messageCounts: {},
      });
    }
    return { skipped: true, reason: 'no-channels' };
  }

  logger(`[discord-prefetch] discovered ${channels.length} channel(s): ${channels.join(', ')}`);

  if (dryRun) {
    logger('[discord-prefetch] dry-run mode: no API requests, no journal writes');
    return {
      dryRun: true,
      skipped: false,
      channels,
    };
  }

  const token = loadDiscordToken(config);
  if (!token) {
    throw new Error('No Discord token found (channels.discord.token, secrets.DISCORD_TOKEN, or DISCORD_TOKEN env).');
  }

  const existingIds = loadExistingDiscordMessageIds();
  const toWrite = [];
  const messageCounts = {};

  for (let i = 0; i < channels.length; i += 1) {
    const channelId = channels[i];
    let fetched = [];
    try {
      fetched = await fetchChannelMessages(channelId, token);
    } catch (err) {
      logger(`[discord-prefetch] fetch failed for channel ${channelId}: ${err instanceof Error ? err.message : String(err)}`);
      messageCounts[channelId] = 0;
      if (i < channels.length - 1) await sleep(200);
      continue;
    }

    const fresh = [];
    for (const message of fetched) {
      const id = String(message?.id || '');
      if (!id || existingIds.has(id)) continue;
      existingIds.add(id);
      fresh.push(toJournalRecord(message, channelId));
    }

    messageCounts[channelId] = fresh.length;
    toWrite.push(...fresh);

    if (i < channels.length - 1) await sleep(200);
  }

  toWrite.sort((a, b) => a.ts - b.ts);
  appendRecordsToJournal(toWrite);

  const state = {
    timestamp: nowMs,
    iso: new Date(nowMs).toISOString(),
    channelsPrefetched: channels,
    messageCounts,
  };
  writePrefetchState(state);

  logger(`[discord-prefetch] wrote ${toWrite.length} new message(s) across ${channels.length} channel(s)`);
  return {
    skipped: false,
    dryRun: false,
    channels,
    messageCounts,
    written: toWrite.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await runPrefetch(args);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[discord-prefetch] fatal:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
