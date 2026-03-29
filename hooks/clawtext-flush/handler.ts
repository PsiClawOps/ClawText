import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const INGEST_STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'ingest');
const BUFFER_FILE = path.join(INGEST_STATE_DIR, 'extract-buffer.jsonl');
const STATE_FILE  = path.join(INGEST_STATE_DIR, 'extract-state.json');
const BUILD_SCRIPT = path.join(WORKSPACE, 'skills/clawtext/scripts/build-clusters.js');

/**
 * ClawText Session-End Flush Hook
 *
 * Fires on agent:reset (i.e. /new command). Immediately flushes any
 * unprocessed buffer records into today's memory file using simple
 * keyword-based extraction (no LLM call — must stay synchronous and fast).
 *
 * The LLM-quality extraction still happens in the 20-min cron. This hook
 * ensures nothing is lost when a session ends between cron windows.
 */
const handler = async (event) => {
  if (event.type !== 'agent' || event.action !== 'reset') return;

  try {
    if (!fs.existsSync(INGEST_STATE_DIR)) fs.mkdirSync(INGEST_STATE_DIR, { recursive: true });
    if (!fs.existsSync(BUFFER_FILE)) return;

    const state = fs.existsSync(STATE_FILE)
      ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
      : { lastExtractedTs: 0, totalExtracted: 0 };

    const raw = fs.readFileSync(BUFFER_FILE, 'utf8');
    const hasTrailingNewline = raw.endsWith('\n');
    const lines = raw.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (!hasTrailingNewline && lines.length > 0) {
      // Writer may be mid-append; ignore trailing partial JSON line.
      lines.pop();
    }

    const records = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(r => r && r.ts > state.lastExtractedTs);

    if (records.length < 3) return; // nothing worth saving

    // Write raw buffer dump to today's memory file as a session snapshot
    const today = new Date().toISOString().slice(0, 10);
    const memFile = path.join(WORKSPACE, `memory/${today}.md`);

    const snapshot = [
      '',
      '---',
      `date: ${today}`,
      'project: general',
      'type: session-snapshot',
      `entities: [${[...new Set(records.map(r => r.from))].join(', ')}]`,
      `keywords: [session, conversation, auto-flush, reset]`,
      '---',
      '',
      `## Auto-flush: session-end snapshot (${records.length} messages)`,
      '',
      records.map(r => `**${r.dir === 'in' ? '→' : '←'} ${r.from}:** ${r.content.slice(0, 300)}${r.content.length > 300 ? '…' : ''}`).join('\n\n'),
      '',
    ].join('\n');

    fs.appendFileSync(memFile, snapshot);

    // Update state watermark
    const maxTs = Math.max(...records.map(r => r.ts));
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      ...state,
      lastExtractedTs: maxTs,
      lastRunAt: new Date().toISOString(),
      totalExtracted: (state.totalExtracted || 0),
      lastFlushSource: 'session-end-hook',
    }, null, 2));

    // Async cluster rebuild (fire and forget — don't block the reset)
    if (fs.existsSync(BUILD_SCRIPT)) {
      setTimeout(() => {
        try {
          execSync(`node "${BUILD_SCRIPT}" --force`, {
            cwd: WORKSPACE,
            stdio: 'ignore',
            timeout: 30000,
          });
        } catch { /* silent */ }
      }, 500);
    }

  } catch (err) {
    if (process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-flush] session-end error:', err instanceof Error ? err.message : String(err));
    }
  }
};

export default handler;
