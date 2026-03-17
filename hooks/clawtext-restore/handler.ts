import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');

// Only inject context if the most recent message is within this window
const MAX_CONTEXT_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours
// How many messages to inject into bootstrap context
const INJECT_LIMIT = 20;
// Minimum messages before bothering to inject
const MIN_MESSAGES = 3;

// ── Read journal records for a channel from recent files ─────────────────────
function readRecentJournalRecords(channelId: string, limitDays = 2): Array<Record<string, unknown>> {
  if (!fs.existsSync(JOURNAL_DIR)) return [];

  const files = fs.readdirSync(JOURNAL_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.jsonl$/))
    .sort()
    .reverse()
    .slice(0, limitDays);

  const records: Array<Record<string, unknown>> = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(JOURNAL_DIR, file), 'utf8');
      for (const line of raw.trim().split('\n').filter(Boolean)) {
        try {
          const rec = JSON.parse(line) as Record<string, unknown>;
          if (rec.channel === channelId || rec.conversationId === channelId) {
            records.push(rec);
          }
        } catch { /* skip malformed */ }
      }
    } catch { /* skip unreadable file */ }
  }

  return records.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
}

// ── Format recent records as a compact context block ─────────────────────────
function formatContextBlock(records: Array<Record<string, unknown>>, channelId: string): string {
  const messages = records.filter(r => r.type !== 'checkpoint');
  const checkpoints = records.filter(r => r.type === 'checkpoint');
  const lastCheckpoint = checkpoints[checkpoints.length - 1];

  const recent = messages.slice(-INJECT_LIMIT);
  if (recent.length < MIN_MESSAGES) return '';

  const first = new Date(Number(recent[0].ts)).toISOString().replace('T', ' ').slice(0, 16);
  const last = new Date(Number(recent[recent.length - 1].ts)).toISOString().replace('T', ' ').slice(0, 16);
  const threadName = (recent.find(r => r.threadName) as Record<string, unknown> | undefined)?.threadName as string || channelId;
  const lastTopics = lastCheckpoint
    ? (lastCheckpoint.recentTopics as string[] || []).join(', ')
    : '';

  const lines = [
    `<!-- CLAWTEXT CONTEXT RESTORE: journal replay for ${threadName} -->`,
    `<!-- ${recent.length} messages | ${first} → ${last} | channel: ${channelId} -->`,
    lastTopics ? `<!-- Recent topics: ${lastTopics} -->` : '',
    '',
    '**[Restored context from journal — recent conversation]**',
    '',
  ];

  for (const rec of recent) {
    const time = new Date(Number(rec.ts)).toISOString().replace('T', ' ').slice(0, 16);
    const arrow = rec.dir === 'in' ? '→' : '←';
    const who = (rec.sender || rec.from || (rec.dir === 'in' ? 'user' : 'agent')) as string;
    const content = (rec.content as string || '').trim();
    const preview = content.length > 300 ? content.slice(0, 300) + '…' : content;
    if (preview) {
      lines.push(`[${time}] ${arrow} **${who}:** ${preview}`);
    }
  }

  lines.push('');
  lines.push('<!-- END CLAWTEXT CONTEXT RESTORE -->');

  return lines.filter(l => l !== null).join('\n');
}

// ── Hook handler ──────────────────────────────────────────────────────────────
const handler = async (event: {
  type: string;
  action: string;
  sessionKey: string;
  context: Record<string, unknown>;
  messages: string[];
}) => {
  // Only on agent bootstrap
  if (event.type !== 'agent' || event.action !== 'bootstrap') return;

  try {
    const ctx = event.context || {};

    // Derive channel from session key or context
    // Session key format: agent:channel-mini:discord:channel:<channelId>
    const sessionKey = event.sessionKey || '';
    let channelId = (ctx.channelId as string) || '';

    if (!channelId && sessionKey.includes(':channel:')) {
      channelId = sessionKey.split(':channel:').pop() || '';
    }
    if (!channelId && sessionKey.includes(':topic:')) {
      channelId = sessionKey.split(':topic:').pop() || '';
    }

    if (!channelId || channelId === 'unknown') return;

    const records = readRecentJournalRecords(channelId);
    if (records.length < MIN_MESSAGES) return;

    // Check if most recent message is fresh enough to be worth injecting
    const lastMsg = records.filter(r => r.type !== 'checkpoint').slice(-1)[0];
    if (!lastMsg) return;
    const age = Date.now() - Number(lastMsg.ts);
    if (age > MAX_CONTEXT_AGE_MS) return;

    const contextBlock = formatContextBlock(records, channelId);
    if (!contextBlock) return;

    // Push into the bootstrap messages array — OpenClaw injects these into
    // the session context during startup
    event.messages.push(contextBlock);

    if (process.env.DEBUG_CLAWTEXT) {
      console.log(`[clawtext-restore] injected ${records.length} journal records for channel ${channelId}`);
    }
  } catch (err) {
    // Never crash bootstrap
    if (process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-restore] error:', err instanceof Error ? err.message : String(err));
    }
  }
};

export default handler;
