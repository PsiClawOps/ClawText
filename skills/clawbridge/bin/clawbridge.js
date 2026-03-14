#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

const DISCORD_MAX_CHUNK = 1800;
const SEND_RETRIES = 2;
const MAX_RUNTIME_MS_DEFAULT = 120000;
const MAX_LIST_ITEMS_DEFAULT = 15;
const MAX_TEXT_FIELD_CHARS_DEFAULT = 2000;
const MAX_READ_LIMIT_DEFAULT = 80;
const MAX_READ_LIMIT_HARD_CAP = 200;
const MAX_TOTAL_CHUNKS_DEFAULT = 12;
const OPENCLAW_CMD_TIMEOUT_MS = 30000;
const LOCK_PATH = path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), 'clawbridge', 'run.lock');
const LOCK_STALE_MS_DEFAULT = 10 * 60 * 1000;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) {
      out._.push(a);
      continue;
    }

    if (a.startsWith('--')) {
      const body = a.slice(2);
      let key = body;
      let value = true;
      if (body.includes('=')) {
        const idx = body.indexOf('=');
        key = body.slice(0, idx);
        value = body.slice(idx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        value = argv[++i];
      }

      if (out[key] === undefined) out[key] = value;
      else if (Array.isArray(out[key])) out[key].push(value);
      else out[key] = [out[key], value];
      continue;
    }

    // short flags: -m value
    const key = a.replace(/^-+/, '');
    let value = true;
    if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
      value = argv[++i];
    }
    out[key] = value;
  }
  return out;
}

function asArray(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function normalizeIncomingTarget(rawTarget) {
  const target = String(rawTarget || '').trim();
  if (target.startsWith('thread:')) return target.slice('thread:'.length).trim();
  if (target.startsWith('channel:')) return target.slice('channel:'.length).trim();
  return target;
}

function hasExplicitThreadPrefix(rawTarget) {
  return String(rawTarget || '').trim().startsWith('thread:');
}

function normalizeAttachThreadInput(rawTarget) {
  const original = String(rawTarget || '').trim();
  if (!original) return '';

  if (hasExplicitThreadPrefix(original)) {
    throw new Error(
      `Invalid attach-thread target \"${original}\": Discord writer does not accept thread:ID here. Use the raw thread/channel id or channel:ID instead.`
    );
  }

  return normalizeIncomingTarget(original);
}

function extractJson(output) {
  const t = String(output || '').trim();
  const idx = t.indexOf('{');
  if (idx === -1) {
    throw new Error('No JSON object found in command output');
  }
  const candidate = t.slice(idx);
  return JSON.parse(candidate);
}

function runOpenclaw(args) {
  try {
    const out = execFileSync('openclaw', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: OPENCLAW_CMD_TIMEOUT_MS,
    });
    return extractJson(out);
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr || '').trim() : '';
    const stdout = err.stdout ? String(err.stdout || '').trim() : '';
    const details = [err.message, stdout, stderr].filter(Boolean).join(' | ');
    throw new Error(`OpenClaw command failed for [${args.join(' ')}]: ${details}`);
  }
}

function acquireRunLock(staleMs = LOCK_STALE_MS_DEFAULT) {
  const lockDir = path.dirname(LOCK_PATH);
  fs.mkdirSync(lockDir, { recursive: true });

  let existing = null;
  try {
    const existingRaw = fs.readFileSync(LOCK_PATH, 'utf8');
    existing = existingRaw ? JSON.parse(existingRaw) : null;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`ClawBridge: lock read issue (${err.message}); attempting overwrite.`);
      existing = null;
    }
  }

  const hasActiveOwner = (() => {
    if (!existing || !existing.pid || !existing.startedAt) return false;
    const age = Date.now() - Number(existing.startedAt);
    if (!Number.isFinite(age) || age <= 0) return false;
    if (age >= staleMs) return false;
    try {
      process.kill(Number(existing.pid), 0);
      return true;
    } catch (err) {
      return err.code === 'ESRCH' ? false : true;
    }
  })();

  if (hasActiveOwner) {
    throw new Error(`Another clawbridge run is active (pid=${existing.pid}, startedAt=${existing.startedAt}). Abort to prevent duplicate token burn.`);
  }

  try {
    fs.unlinkSync(LOCK_PATH);
  } catch (_) {}

  const payload = {
    pid: process.pid,
    startedAt: Date.now(),
    runtimeMs: LOCK_STALE_MS_DEFAULT,
    startedBy: process.env.USER || process.env.LOGNAME || 'unknown',
  };

  const fd = fs.openSync(LOCK_PATH, 'wx');
  try {
    fs.writeFileSync(fd, JSON.stringify(payload), 'utf8');
  } finally {
    fs.closeSync(fd);
  }

  const cleanup = () => {
    try { fs.unlinkSync(LOCK_PATH); } catch (_) {}
  };
  process.once('exit', cleanup);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  return cleanup;
}

function assertCommandSuccess(payload, context = '') {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid OpenClaw response object for ${context}`);
  }

  if (payload.error || payload.ok === false || payload.success === false) {
    const details = payload.error || payload.message || 'OpenClaw returned failure status';
    throw new Error(`OpenClaw command failed for ${context}: ${details}`);
  }

  return true;
}

function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

function uniq(xs) {
  const seen = new Set();
  const out = [];
  for (const x of xs) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function truncateText(text, maxChars = MAX_TEXT_FIELD_CHARS_DEFAULT) {
  const s = String(text || '').trim();
  const limit = clampInt(maxChars, MAX_TEXT_FIELD_CHARS_DEFAULT, 80, 20000);
  if (s.length <= limit) return s;
  if (limit <= 1) return s.slice(0, limit);
  return `${s.slice(0, limit - 1)}…`;
}

function normalizeList(items, maxItems, maxItemChars) {
  return uniq(asArray(items))
    .slice(0, clampInt(maxItems, MAX_LIST_ITEMS_DEFAULT, 1, 80))
    .map((entry) => truncateText(entry, maxItemChars));
}

function splitForDiscord(text, max = DISCORD_MAX_CHUNK) {
  const raw = String(text || '');
  if (raw.length <= max) return [raw];

  const paras = raw.split('\n\n');
  const chunks = [];
  let cur = '';

  for (const p of paras) {
    if (!cur) {
      if (p.length <= max) cur = p;
      else {
        for (let i = 0; i < p.length; i += max) chunks.push(p.slice(i, i + max));
      }
      continue;
    }

    const candidate = `${cur}\n\n${p}`;
    if (candidate.length <= max) {
      cur = candidate;
    } else {
      chunks.push(cur);
      if (p.length <= max) cur = p;
      else {
        for (let i = 0; i < p.length; i += max) chunks.push(p.slice(i, i + max));
        cur = '';
      }
    }
  }

  if (cur) chunks.push(cur);
  return chunks;
}

function readMessages(sourceThreadId, limit) {
  const id = normalizeIncomingTarget(sourceThreadId);
  const candidates = [id];
  if (!id.startsWith('channel:') && !id.startsWith('thread:')) {
    candidates.unshift(`channel:${id}`);
  }

  let lastError = null;
  let parsedMessages = [];

  for (const target of candidates) {
    try {
      const resp = runOpenclaw([
        'message', 'read',
        '--channel', 'discord',
        '--target', target,
        '--limit', String(limit),
        '--json',
      ]);

      assertCommandSuccess(resp, `read source messages (target=${target})`);

      const msgs = resp?.payload?.messages || resp?.messages || [];
      parsedMessages = Array.isArray(msgs) ? msgs : [];
      if (parsedMessages.length >= 0) {
        return parsedMessages;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  if (lastError) {
    throw new Error(`Failed to read source messages from ${sourceThreadId}: ${lastError.message}`);
  }

  return [];
}

function safeWrite(filePath, text) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function summarizeArtifacts(paths, artifacts, initMsg, mode) {
  const sections = [];
  const pushSection = (name, text, filePath, enabled = true) => {
    if (!enabled) return;
    const content = String(text || '');
    const chunks = splitForDiscord(`## ${name.toUpperCase().replace(/_/g, ' ')}\n\n${content}`, DISCORD_MAX_CHUNK).length;
    sections.push({
      name,
      path: filePath,
      chars: content.length,
      chunks,
    });
  };

  pushSection('short', artifacts.short, paths.short, mode !== 'memory');
  pushSection('full', artifacts.full, paths.full, true);
  pushSection('bootstrap', artifacts.bootstrap, paths.bootstrap, mode !== 'memory');

  const initChunks = splitForDiscord(initMsg, DISCORD_MAX_CHUNK).length;
  const contentChunks = sections.reduce((sum, section) => sum + section.chunks, 0);

  return {
    init: {
      chars: String(initMsg || '').length,
      chunks: initChunks,
    },
    sections,
    totalArtifactChars: sections.reduce((sum, section) => sum + section.chars, 0),
    totalContentChunks: contentChunks,
    totalOutgoingMessages: initChunks + contentChunks,
  };
}

function makeArtifacts(args, messages, paths) {
  const chronological = [...messages].reverse();
  const nonBot = [...chronological].filter(m => !m?.author?.bot && String(m?.content || '').trim());
  const botMsgs = [...chronological].filter(m => m?.author?.bot && String(m?.content || '').trim());

  const objective = truncateText(
    (args.objective && String(args.objective).trim()) ||
    (nonBot.length ? String(nonBot[nonBot.length - 1].content).trim().slice(0, 260) : 'Continue active work with full continuity.'),
    args.maxTextFieldChars
  );

  let established = normalizeList(asArray(args.established), args.maxListItems, args.maxTextFieldChars);
  if (!established.length) {
    const bullets = [];
    for (const m of botMsgs.slice(-10)) {
      const lines = String(m.content || '').split('\n').map(s => s.trim());
      for (const line of lines) {
        if (line.startsWith('- ') || line.startsWith('• ')) bullets.push(line.replace(/^[-•]\s*/, ''));
      }
    }
    established = uniq(bullets).slice(0, 6);
  }
  if (!established.length) {
    established = [
      'ClawBridge is continuity + transfer (not just thread mechanics).',
      'ClawTask is a core ClawDash coordination pillar.',
      'Continuity artifacts are distinct from durable memory artifacts.',
    ];
  }

  let open = normalizeList(asArray(args.open), args.maxListItems, args.maxTextFieldChars);
  if (!open.length) {
    const lastUser = nonBot.length ? String(nonBot[nonBot.length - 1].content || '') : '';
    const guessed = lastUser.split(/\?|\n/).map(s => truncateText(s.trim(), args.maxTextFieldChars)).filter(Boolean).slice(0, 3);
    open = guessed.length ? guessed.map(s => `${s}?`) : [
      'Finalize first milestone execution order for ClawTask.',
      'Define incident taxonomy and action-policy matrix details.',
      'Define automation boundaries for ClawBridge Phase 2.',
    ];
  }

  let next = normalizeList(asArray(args.next), args.maxListItems, args.maxTextFieldChars);
  if (!next.length) {
    next = [
      'Seed ClawTask board cards for Milestone 1 in ClawDash lane.',
      'Finalize shared event schema and telemetry entities.',
      'Use ClawBridge continuity packets for major lane transfers.',
    ];
  }

  open = open.map((item) => truncateText(item, args.maxTextFieldChars));
  next = next.map((item) => truncateText(item, args.maxTextFieldChars));

  const lane = args.lane || 'ClawDash coordination lane';
  const product = args.product || 'ClawDash / ClawBridge';

  const short = [
    '# ClawBridge Extract — Short Handoff',
    '',
    `**Context:** ${objective}`,
    '',
    '**Established:**',
    ...established.map(x => `- ${x}`),
    '',
    '**Open now:**',
    ...open.map(x => `- ${x}`),
    '',
    '**Next:**',
    ...next.map(x => `- ${x}`),
    '',
    '**Full context:**',
    `- ${path.relative(args.workspace, paths.full)}`,
    `- ${path.relative(args.workspace, paths.bootstrap)}`,
  ].join('\n');

  const full = [
    '# ClawBridge Extract — Full Continuity Packet',
    '',
    '## Why this handoff exists',
    'Transfer active work into a focused lane without losing high-context continuity.',
    '',
    '## Current objective',
    objective,
    '',
    '## Established decisions',
    ...established.map(x => `- ${x}`),
    '',
    '## Open questions',
    ...open.map(x => `- ${x}`),
    '',
    '## Lane / product context',
    `- **Product:** ${product}`,
    `- **Lane:** ${lane}`,
    `- **Source thread:** ${args.sourceThread}`,
    `- **Target forum:** ${args.targetForum}`,
    '',
    '## Relevant artifacts',
    `- ${path.relative(args.workspace, paths.short)}`,
    `- ${path.relative(args.workspace, paths.full)}`,
    `- ${path.relative(args.workspace, paths.bootstrap)}`,
    '',
    '## Immediate next steps',
    ...next.map((x, i) => `${i + 1}. ${x}`),
    '',
    '## What not to re-litigate',
    '- Continuity and durable memory are distinct concerns.',
    '- ClawBridge naming is final and should be used directly.',
  ].join('\n');

  const bootstrap = [
    '# Next-Agent Bootstrap — ClawBridge Extract',
    '',
    '## Read these first',
    `1. ${path.relative(args.workspace, paths.full)}`,
    `2. ${path.relative(args.workspace, paths.short)}`,
    '',
    '## Current objective',
    objective,
    '',
    '## Already decided',
    ...established.map(x => `- ${x}`),
    '',
    '## Still open',
    ...open.map(x => `- ${x}`),
    '',
    '## First action',
    (next[0] || 'Continue from the latest milestone tasks.'),
    '',
    '## Avoid re-deriving',
    '- Core platform pillar split and role boundaries.',
    '- ClawBridge role as continuity + transfer layer.',
  ].join('\n');

  safeWrite(paths.short, short);
  safeWrite(paths.full, full);
  safeWrite(paths.bootstrap, bootstrap);

  return { short, full, bootstrap, artifactCount: { short: short.length, full: full.length, bootstrap: bootstrap.length } };
}

function createThread(targetForum, title, initMessage) {
  const resp = runOpenclaw([
    'message', 'thread', 'create',
    '--channel', 'discord',
    '--target', `channel:${targetForum}`,
    `--thread-name=${title}`,
    '-m', initMessage,
    '--json',
  ]);

  assertCommandSuccess(resp, 'create thread');
  const thread = resp?.payload?.thread || resp?.thread || {};
  const threadId = thread.id;
  if (!threadId) throw new Error('Failed to parse created thread id');
  return threadId;
}

function extractMessageId(payload, context) {
  const candidates = [
    payload?.payload?.message?.id,
    payload?.payload?.messageId,
    payload?.payload?.result?.messageId,
    payload?.result?.messageId,
    payload?.result?.id,
    payload?.message?.id,
    payload?.id,
  ];

  const candidate = candidates.find((value) => String(value || '').trim() !== '');
  if (!candidate) {
    throw new Error(`No message identifier returned for ${context}`);
  }

  return String(candidate);
}

function normalizeDiscordTarget(target) {
  const t = String(target || '').trim();
  if (!t) return [];

  const targets = [t];
  if (!t.startsWith('channel:')) {
    targets.push(`channel:${t}`);
  }

  return uniq(targets);
}

function isTerminalTargetError(err) {
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('unknown channel') ||
    msg.includes('unknown target') ||
    msg.includes('unknown') && msg.includes('channel') ||
    msg.includes('forbidden') ||
    msg.includes('access')
  );
}

function canReadTarget(target) {
  const resp = runOpenclaw([
    'message', 'read',
    '--channel', 'discord',
    '--target', target,
    '--limit', '1',
    '--json',
  ]);
  assertCommandSuccess(resp, `read destination check ${target}`);
  return resp;
}

function resolveDestinationTarget(rawTarget) {
  const normalized = normalizeIncomingTarget(rawTarget);
  const candidates = normalizeDiscordTarget(normalized);
  let lastError = null;

  for (const target of candidates) {
    try {
      canReadTarget(target);
      return target;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`Failed to validate destination thread/channel ${rawTarget}: ${lastError ? lastError.message : 'unknown error'}`);
}

function sendChunkToThread(threadId, c, idx) {
  const targets = normalizeDiscordTarget(threadId);
  let lastError = null;

  for (const target of targets) {
    try {
      const resp = runOpenclaw([
        'message', 'send',
        '--channel', 'discord',
        '--target', target,
        '-m', c,
        '--json',
      ]);
      assertCommandSuccess(resp, `send chunk ${idx} to ${target}`);
      return extractMessageId(resp, `send chunk ${idx} to ${target}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (isTerminalTargetError(lastError)) {
        throw new Error(`Failed chunk ${idx}/${targets.length} due terminal channel target error: ${lastError.message}`);
      }
    }
  }

  throw new Error(`Failed chunk ${idx}/${targets.length} after ${targets.length} attempts: ${lastError ? lastError.message : 'unknown error'}`);
}

function sendToThread(threadId, text) {
  const chunks = splitForDiscord(text, DISCORD_MAX_CHUNK);
  const messageIds = [];

  for (let i = 0; i < chunks.length; i++) {
    let attempt = 0;
    let lastError = null;
    while (attempt <= SEND_RETRIES) {
      try {
        const id = sendChunkToThread(threadId, chunks[i], i + 1);
        messageIds.push(id);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (isTerminalTargetError(lastError)) {
          throw new Error(`Failed chunk ${i + 1}/${chunks.length} due terminal target error: ${lastError.message}`);
        }

        attempt += 1;
        if (attempt > SEND_RETRIES) {
          throw new Error(`Failed chunk ${i + 1}/${chunks.length} after ${SEND_RETRIES + 1} attempts: ${lastError.message}`);
        }
        const waitMs = 300 * Math.pow(2, attempt - 1);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
      }
    }
  }

  return { count: chunks.length, messageIds };
}

function maybeIngest(args, fullPath) {
  if (!args.ingest) return { ingested: false };
  const ingestCli = path.join(args.workspace, 'skills', 'clawtext', 'bin', 'ingest.js');
  const buildClusters = path.join(args.workspace, 'skills', 'clawtext', 'scripts', 'build-clusters.js');

  execSync(`node ${JSON.stringify(ingestCli)} ingest-text --input=${JSON.stringify(fullPath)} --project=${JSON.stringify(args.project || 'clawbridge')} --source=${JSON.stringify(args.source || 'clawbridge:auto')} --type=continuity-packet --verbose`, {
    stdio: 'inherit',
    shell: true,
  });

  if (args.rebuild !== false) {
    execSync(`node ${JSON.stringify(buildClusters)} --force`, { stdio: 'inherit', shell: true });
  }

  return { ingested: true };
}

function writeTransferBackup(args, messages, paths, results) {
  const backupRoot = path.join(args.workspace, 'memory', 'bridge', 'backups', 'clawbridge');
  const stamp = nowStamp();
  const safeSource = String(args.sourceThread).replace(/[^a-zA-Z0-9_-]/g, '_');
  const backupDir = path.join(backupRoot, `${stamp}_${safeSource}`);

  fs.mkdirSync(backupDir, { recursive: true });

  const backup = {
    capturedAt: new Date().toISOString(),
    sourceThread: args.sourceThread,
    targetForum: args.targetForum,
    threadId: args.attachThread || null,
    mode: args.mode,
    title: args.title || null,
    createdThread: results.createdThread,
    destinationThreadId: results.threadId || null,
    destinationUrl: results.threadUrl || null,
    sourceMessageCount: messages.length,
    readLimit: Number(args.limit || 0),
    artifacts: {
      short: path.relative(args.workspace, paths.short),
      full: path.relative(args.workspace, paths.full),
      bootstrap: path.relative(args.workspace, paths.bootstrap),
    },
    postResults: results.postResults,
  };

  safeWrite(path.join(backupDir, 'backup-manifest.json'), `${JSON.stringify(backup, null, 2)}\n`);
  safeWrite(path.join(backupDir, 'source-messages.json'), `${JSON.stringify(messages, null, 2)}\n`);
  return backupDir;
}

function showHelp() {
  console.log(`
ClawBridge CLI (Phase 1)
=======================

Usage:
  clawbridge extract-discord-thread --source-thread <id> --target-forum <id> [options]

Options:
  --mode <continuity|memory|dual>   Output mode (default: continuity)
  --limit <n>                       Message read limit (default: 80)
  --max-read-limit <n>              Hard cap on limit (default: 200)
  --max-runtime-ms <n>              Abort runtime after N ms (default: 120000)
  --max-text-chars <n>              Truncate large objective/open/next fields (default: 2000)
  --max-list-items <n>              Truncate open/next/established item count (default: 15)
  --max-total-chunks <n>            Maximum total outgoing Discord messages before blocking live send (default: 12)
  --allow-large                     Allow live sends above max-total-chunks
  --estimate-only                   Generate artifacts + predicted chunk counts only; do not post or ingest
  --include-artifacts               Include full artifact bodies in JSON output (default: off)
  --workspace <path>                Workspace root (default: ~/.openclaw/workspace)
  --title "..."                     Required only when creating a new thread
  --attach-thread <id>              Post packet into an existing thread instead of creating one
                                    (use raw id or channel:ID; do not use thread:ID)
  --no-create-thread                Generate artifacts only (no Discord post)

  # agent-led overrides (manual where needed)
  --objective "..."
  --established "..."              Repeatable
  --open "..."                     Repeatable
  --next "..."                     Repeatable
  --product "..."
  --lane "..."

  # optional durable promotion
  --ingest                          Promote full packet via ClawText ingest
  --project <name>                  Ingest project label (default: clawbridge)
  --source <label>                  Ingest source label (default: clawbridge:auto)
  --no-rebuild                      Skip cluster rebuild after ingest

Example:
  clawbridge extract-discord-thread \
    --source-thread 1480315446694641664 \
    --target-forum 1475021817168134144 \
    --title "ClawBridge Test Extract" \
    --mode dual \
    --ingest \
    --objective "Transfer architecture continuity to ClawDash lane"
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help' || args.help || args.h) {
    showHelp();
    process.exit(0);
  }

  if (cmd !== 'extract-discord-thread') {
    console.error(`Unknown command: ${cmd}`);
    showHelp();
    process.exit(1);
  }

  const lockCleanup = acquireRunLock();
  const workspace = args.workspace || path.join(process.env.HOME || '', '.openclaw', 'workspace');
  const sourceThread = normalizeIncomingTarget(args['source-thread'] || args.sourceThread);
  let targetForum = normalizeIncomingTarget(args['target-forum'] || args.targetForum);
  const title = args.title;
  let attachThread;
  try {
    attachThread = normalizeAttachThreadInput(args['attach-thread'] || args.attachThread);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const noCreateThread = Boolean(args['no-create-thread'] || args.noCreateThread);
  const mode = (args.mode || 'continuity').toLowerCase();
  const rawLimit = Number(args.limit || MAX_READ_LIMIT_DEFAULT);
  const maxReadLimit = clampInt(args['max-read-limit'] || args.maxReadLimit || MAX_READ_LIMIT_HARD_CAP, MAX_READ_LIMIT_HARD_CAP, 1, 500);
  const limit = Math.min(Math.max(rawLimit, 1), maxReadLimit);
  const maxRuntimeMs = clampInt(args['max-runtime-ms'] || args.maxRuntimeMs || MAX_RUNTIME_MS_DEFAULT, MAX_RUNTIME_MS_DEFAULT, 5000, 600000);
  const maxTextFieldChars = clampInt(args['max-text-chars'] || args.maxTextChars || MAX_TEXT_FIELD_CHARS_DEFAULT, MAX_TEXT_FIELD_CHARS_DEFAULT, 80, 20000);
  const maxListItems = clampInt(args['max-list-items'] || args.maxListItems || MAX_LIST_ITEMS_DEFAULT, MAX_LIST_ITEMS_DEFAULT, 1, 80);
  const maxTotalChunks = clampInt(args['max-total-chunks'] || args.maxTotalChunks || MAX_TOTAL_CHUNKS_DEFAULT, MAX_TOTAL_CHUNKS_DEFAULT, 1, 500);
  const estimateOnly = Boolean(args['estimate-only'] || args.estimateOnly);
  const includeArtifacts = Boolean(args['include-artifacts'] || args.includeArtifacts);
  const allowLarge = Boolean(args['allow-large'] || args.allowLarge);

  if (!sourceThread || !targetForum) {
    console.error('Missing required args: --source-thread, --target-forum');
    process.exit(1);
  }

  if (!attachThread && !noCreateThread && !title) {
    console.error('Missing required arg when creating a new thread: --title');
    process.exit(1);
  }

  try {
    targetForum = resolveDestinationTarget(targetForum);
  } catch (err) {
    console.error(`Invalid target forum ${targetForum}: ${err.message}`);
    process.exit(1);
  }

  const stamp = nowStamp();
  const handoffsDir = path.join(workspace, 'docs', 'handoffs');
  const bootstrapDir = path.join(workspace, 'docs', 'bootstrap');
  fs.mkdirSync(handoffsDir, { recursive: true });
  fs.mkdirSync(bootstrapDir, { recursive: true });

  const paths = {
    short: path.join(handoffsDir, `CLAWBRIDGE_SHORT_${stamp}.md`),
    full: path.join(handoffsDir, `CLAWBRIDGE_FULL_${stamp}.md`),
    bootstrap: path.join(bootstrapDir, `NEXT_AGENT_BOOTSTRAP_CLAWBRIDGE_${stamp}.md`),
  };

  const normalizedArgs = {
    ...args,
    workspace,
    sourceThread,
    targetForum,
    title,
    mode,
    limit,
    maxTextFieldChars,
    maxListItems,
    maxRuntimeMs,
    maxTotalChunks,
    estimateOnly,
    includeArtifacts,
    allowLarge,
  };

  if (rawLimit !== limit) {
    console.error(`ClawBridge: capped --limit ${rawLimit} to ${limit} (max-read-limit=${maxReadLimit}).`);
  }

  const startedAtMs = Date.now();
  const hardTimeout = setTimeout(() => {
    const elapsed = Date.now() - startedAtMs;
    console.error(`ClawBridge timeout after ${elapsed}ms (limit ${maxRuntimeMs}ms). Aborting to prevent token burn.`);
    process.exit(2);
  }, maxRuntimeMs);
  hardTimeout.unref();

  const messages = readMessages(sourceThread, limit);
  const artifacts = makeArtifacts(normalizedArgs, messages, paths);

  const initMsg = [
    `🧠 **ClawBridge extract (${mode}) complete**`,
    '',
    `Source thread: ${sourceThread}`,
    `Generated artifacts:`,
    `- ${path.relative(workspace, paths.short)}`,
    `- ${path.relative(workspace, paths.full)}`,
    `- ${path.relative(workspace, paths.bootstrap)}`,
  ].join('\n');

  const postResults = {
    init: null,
    short: null,
    full: null,
    bootstrap: null,
    attached: false,
  };

  const artifactSummary = summarizeArtifacts(paths, artifacts, initMsg, mode);
  const exceedsChunkCap = artifactSummary.totalOutgoingMessages > maxTotalChunks;

  if (estimateOnly) {
    clearTimeout(hardTimeout);
    lockCleanup();
    const estimateResult = {
      ok: true,
      mode,
      estimateOnly: true,
      sourceThread,
      targetForum,
      attachThread: attachThread || null,
      safety: {
        maxTotalChunks,
        allowLarge,
        exceedsChunkCap,
      },
      artifactSummary,
      artifacts: includeArtifacts ? {
        short: artifacts.short,
        full: artifacts.full,
        bootstrap: artifacts.bootstrap,
      } : {
        shortPath: paths.short,
        fullPath: paths.full,
        bootstrapPath: paths.bootstrap,
      },
    };
    console.log(JSON.stringify(estimateResult, null, 2));
    return;
  }

  if (exceedsChunkCap && !allowLarge) {
    throw new Error(
      `Blocked live send: estimated ${artifactSummary.totalOutgoingMessages} outgoing Discord messages exceeds max-total-chunks=${maxTotalChunks}. Re-run with --estimate-only to inspect or --allow-large to override.`
    );
  }

  let threadId = attachThread || null;
  if (threadId) {
    threadId = resolveDestinationTarget(threadId);
  }

  const createdThread = !threadId && !noCreateThread;
  if (createdThread) {
    threadId = createThread(targetForum, title, initMsg);
    postResults.init = true;
  }

  if (threadId) {
    try {
      if (!createdThread) {
        postResults.init = sendToThread(threadId, initMsg);
      }

      if (mode !== 'memory') {
        postResults.short = sendToThread(threadId, `## SHORT HANDOFF\n\n${artifacts.short}`);
        postResults.full = sendToThread(threadId, `## FULL CONTINUITY PACKET\n\n${artifacts.full}`);
        postResults.bootstrap = sendToThread(threadId, `## NEXT-AGENT BOOTSTRAP\n\n${artifacts.bootstrap}`);
      } else {
        postResults.bootstrap = null;
        postResults.full = sendToThread(threadId, `## MEMORY-PROMOTION CANDIDATE\n\n${artifacts.full}`);
      }
      postResults.attached = true;
    } catch (err) {
      // Bubble up hard so the cron/agent has explicit failure
      throw new Error(`Post failure to destination thread ${threadId}: ${err.message}`);
    }
  }

  const ingestResult = args.ingest ? maybeIngest({ ...args, workspace }, paths.full) : { ingested: false };

  const results = {
    createdThread,
    threadId,
    threadUrl: threadId ? `https://discord.com/channels/${args['guild-id'] || args.guildId || '1474997926919929927'}/${targetForum}/${threadId}` : null,
    mode,
    postResults,
    artifactSummary,
    artifacts: includeArtifacts ? {
      short: artifacts.short,
      full: artifacts.full,
      bootstrap: artifacts.bootstrap,
    } : {
      shortPath: paths.short,
      fullPath: paths.full,
      bootstrapPath: paths.bootstrap,
    },
    ingested: ingestResult.ingested,
    ok: true,
  };

  const backupDir = writeTransferBackup({ ...args, workspace, sourceThread, targetForum, mode }, messages, paths, {
    createdThread,
    threadId,
    threadUrl: results.threadUrl,
    postResults,
  });

  console.log(JSON.stringify({
    ...results,
    backupDir,
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exit(1);
}
