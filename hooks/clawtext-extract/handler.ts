import fs from 'fs';
import path from 'path';
import os from 'os';

const BUFFER_FILE = path.join(os.homedir(), '.openclaw/workspace/memory/extract-buffer.jsonl');

/**
 * ClawText Auto-Extract Hook
 *
 * Appends every message (in/out) to a buffer file.
 * A periodic cron job processes the buffer with an LLM to extract memories.
 * This handler must stay fast — no LLM calls, no blocking I/O waits.
 *
 * Tagging:
 *   _raw_log: true  — content looks like a log dump, stack trace, or JSON blob.
 *                     The extraction cron will skip these for cluster promotion.
 *   _hygiene: true  — content contained sensitive patterns (future: sanitize first).
 */

/**
 * Heuristic: is this content a raw log/tool output/JSON blob rather than prose?
 * If yes, tag it — the extraction cron will not promote it to clusters.
 */
function isRawLog(content) {
  const trimmed = content.trim();

  // Raw JSON object or array
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 100) return true;

  // Stack trace (3+ "at X (file:line)" lines)
  const stackLines = (trimmed.match(/^\s+at\s+\S+.*\(/gm) || []).length;
  if (stackLines >= 3) return true;

  // Shell/CLI output: >60% of non-empty lines start with box-drawing, prompt
  // chars, or numeric prefixes — typical of pasted terminal output
  const lines = trimmed.split('\n').filter(l => l.trim().length > 0);
  if (lines.length >= 6) {
    const noisyLines = lines.filter(l =>
      /^[\s│├─└●·$>|✓✗✔✘]/.test(l.trim()) ||   // box chars, prompts, bullets
      /^\s*\d+[.:]\s/.test(l) ||                  // numbered lists from tool output
      /^={3,}|^-{3,}|^\*{3,}/.test(l.trim())      // divider lines
    ).length;
    if (noisyLines / lines.length > 0.60) return true;
  }

  // Code fence blocks that are very large (pasted file contents / logs)
  const codeFenceMatch = trimmed.match(/```[\s\S]*?```/g);
  if (codeFenceMatch) {
    const totalCodeLen = codeFenceMatch.reduce((s, b) => s + b.length, 0);
    if (totalCodeLen > 2000) return true;
  }

  return false;
}

const handler = async (event) => {
  // Only care about message events
  if (event.type !== 'message') return;
  if (event.action !== 'preprocessed' && event.action !== 'sent') return;

  try {
    const ctx = event.context || {};

    // Skip empty content
    const content = event.action === 'preprocessed'
      ? (ctx.bodyForAgent || ctx.body || '').trim()
      : (ctx.content || '').trim();
    if (!content || content.length < 10) return;

    // Skip bot system noise
    if (content.startsWith('HEARTBEAT_OK') || content.startsWith('NO_REPLY')) return;

    const from = ctx.from || ctx.to || 'unknown';
    const rawLog = isRawLog(content);

    const record = {
      ts: Date.now(),
      dir: event.action === 'sent' ? 'out' : 'in',
      from,
      channel: ctx.channelId || 'unknown',
      conversationId: ctx.conversationId || ctx.groupId || null,
      content: content.slice(0, 4000), // cap very long messages
      // Tag raw logs so extraction cron skips cluster promotion
      ...(rawLog ? { _raw_log: true } : {}),
    };

    // Append to buffer (fire-and-forget, no await to stay fast)
    const line = JSON.stringify(record) + '\n';
    fs.appendFile(BUFFER_FILE, line, (err) => {
      if (err && process.env.DEBUG_CLAWTEXT) {
        console.error('[clawtext-extract] buffer write error:', err.message);
      }
    });
  } catch (err) {
    // Never crash the gateway
    if (process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-extract] hook error:', err instanceof Error ? err.message : String(err));
    }
  }
};

export default handler;
