#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const INGEST_STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'ingest');
const BUFFER_FILE = path.join(INGEST_STATE_DIR, 'extract-buffer.jsonl');
const STATE_FILE = path.join(INGEST_STATE_DIR, 'extract-state.json');
const MIN_BATCH_SIZE = 1;
const MAX_RECORDS = 2000;
const MIN_AGE_HOURS = 24;
const BAD_LINES_FILE = path.join(INGEST_STATE_DIR, 'extract-buffer.bad.jsonl');

function safeReadJSONL(file) {
  if (!fs.existsSync(file)) {
    return { records: [], malformedLines: 0, partialLines: 0, badLines: [] };
  }

  const rawText = fs.readFileSync(file, 'utf8');
  if (!rawText) {
    return { records: [], malformedLines: 0, partialLines: 0, badLines: [] };
  }

  const hasTrailingNewline = rawText.endsWith('\n');
  const lines = rawText.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();

  // If writer is mid-append during read, the trailing line may be partial JSON.
  // Drop it quietly; a later run will ingest once newline-terminated.
  let partialLines = 0;
  if (!hasTrailingNewline && lines.length > 0) {
    lines.pop();
    partialLines = 1;
  }

  const parsed = [];
  let malformedLines = 0;
  const badLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const item = JSON.parse(trimmed);
      if (item && typeof item === 'object') parsed.push(item);
    } catch (err) {
      malformedLines += 1;
      badLines.push(trimmed.slice(0, 2000));
      console.warn('[extract-buffer] skipping malformed buffer line', err?.message || String(err));
    }
  }

  return { records: parsed, malformedLines, partialLines, badLines };
}

function normalizeTs(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function isRecent(ts, nowMs = Date.now()) {
  return nowMs - ts <= MIN_AGE_HOURS * 60 * 60 * 1000;
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      lastExtractedTs: 0,
      totalExtracted: 0,
      lastRunAt: null,
      totalRuns: 0,
      lastError: null,
      lastStatus: null,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      lastExtractedTs: Number(parsed.lastExtractedTs) || 0,
      totalExtracted: Number(parsed.totalExtracted) || 0,
      totalRuns: Number(parsed.totalRuns) || 0,
      lastRunAt: parsed.lastRunAt || null,
      lastError: parsed.lastError || null,
      lastStatus: parsed.lastStatus || null,
    };
  } catch (err) {
    console.warn('[extract-buffer] malformed state file, reinitializing', err?.message || String(err));
    return {
      lastExtractedTs: 0,
      totalExtracted: 0,
      totalRuns: 0,
      lastRunAt: null,
      lastError: null,
      lastStatus: null,
    };
  }
}

function safeAppendToMemory(today, payload) {
  const memFile = path.join(WORKSPACE, `memory/${today}.md`);

  const lines = [];
  lines.push('', '---');
  lines.push(`date: ${today}`);
  lines.push('project: clawtext');
  lines.push('type: extracted-memory');
  lines.push(`entities: [clawtext, working-memory]`);
  lines.push(`keywords: [memory-capture, buffer-extraction, cron-run]`);
  lines.push('source: clawtext-extract-cron');
  lines.push('---', '');

  lines.push(`## Auto-extraction run (${payload.count} records)`);
  lines.push(`- from: ${payload.from.toISOString()}`);
  lines.push(`- to: ${payload.to.toISOString()}`);
  lines.push(`- source: ${payload.sourceThreadCount} messages in buffer snapshot`);
  lines.push('');

  for (const rec of payload.records) {
    const who = rec.from || rec.sender || rec.author || 'unknown';
    const dir = rec.dir === 'out' ? '→' : '←';
    const text = String(rec.content || '').replace(/\s+/g, ' ').trim().slice(0, 360);
    lines.push(`- **${dir} ${who}:** ${text}` + (String(rec.content || '').length > 360 ? '…' : ''));
  }

  if (payload.unparsedLines > 0) {
    lines.push('');
    lines.push(`- ⚠️ Buffer contained ${payload.unparsedLines} genuinely malformed line(s) (JSON parse failures — check extract-buffer.bad.jsonl).`);
  }

  fs.appendFileSync(memFile, `${lines.join('\n')}\n`);
  return memFile;
}

function trimOldBuffer(allRecords) {
  const now = Date.now();
  const keep = allRecords.filter((r) => isRecent(normalizeTs(r.ts), now));
  if (keep.length === allRecords.length) return;

  const payload = keep
    .filter((r) => r && normalizeTs(r.ts) > 0)
    .map((r) => JSON.stringify(r))
    .join('\n');

  fs.writeFileSync(BUFFER_FILE, `${payload}${payload ? '\n' : ''}`, 'utf8');
}

function main() {
  if (!fs.existsSync(INGEST_STATE_DIR)) {
    fs.mkdirSync(INGEST_STATE_DIR, { recursive: true });
  }

  if (!fs.existsSync(BUFFER_FILE)) {
    console.log('[extract-buffer] no buffer file found; nothing to extract');
    return;
  }

  const { records, malformedLines, partialLines, badLines } = safeReadJSONL(BUFFER_FILE);
  const state = readState();

  if (badLines.length > 0) {
    const ts = new Date().toISOString();
    const payload = badLines.map((line) => JSON.stringify({ ts, line }) + '\n').join('');
    fs.appendFileSync(BAD_LINES_FILE, payload, 'utf8');
  }

  const nowMs = Date.now();
  const candidates = records
    .map((item) => ({
      ...item,
      __ts: normalizeTs(item.ts),
    }))
    .filter((r) => r.__ts > (state.lastExtractedTs || 0))
    .sort((a, b) => a.__ts - b.__ts)
    .slice(-MAX_RECORDS);

  if (candidates.length < MIN_BATCH_SIZE) {
    console.log(`[extract-buffer] no new records since ${new Date(state.lastExtractedTs || nowMs).toISOString()}`);

    const newState = {
      ...state,
      lastRunAt: new Date().toISOString(),
      lastStatus: 'no_new_records',
      totalRuns: (state.totalRuns || 0) + 1,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), 'utf8');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const snapshotCount = Math.min(candidates.length, MAX_RECORDS);

  const memoryFile = safeAppendToMemory(today, {
    count: snapshotCount,
    from: new Date(candidates[0].__ts || nowMs),
    to: new Date(candidates[candidates.length - 1].__ts || nowMs),
    sourceThreadCount: candidates.length,
    records: candidates,
    // Only count genuine JSON parse failures as "malformed" — partial lines
    // are a normal race condition between the async hook writer and the cron
    // reader, and are already silently dropped. Including them in this count
    // was causing misleading "Buffer contained NNN malformed line(s)" warnings
    // on every single extraction run.
    unparsedLines: malformedLines,
  });

  const maxTs = Math.max(...candidates.map((r) => r.__ts));

  const newState = {
    lastExtractedTs: maxTs,
    totalExtracted: (state.totalExtracted || 0) + snapshotCount,
    totalRuns: (state.totalRuns || 0) + 1,
    lastRunAt: new Date().toISOString(),
    lastStatus: 'ok',
    lastMemoryFile: path.basename(memoryFile),
    lastBatchSize: snapshotCount,
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), 'utf8');

  trimOldBuffer(records);

  console.log(`[extract-buffer] wrote ${snapshotCount} records to ${memoryFile}`);
}

try {
  main();
} catch (err) {
  const state = (() => {
    try {
      return JSON.parse(fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, 'utf8') : '{}');
    } catch {
      return {};
    }
  })();

  state.lastRunAt = new Date().toISOString();
  state.lastStatus = 'error';
  state.lastError = err instanceof Error ? err.message : String(err);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

  console.error('[extract-buffer] failed:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
