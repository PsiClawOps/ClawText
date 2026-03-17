import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ContextSlot, SlotContext, SlotProvider } from '../slot-provider.js';

const JOURNAL_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'journal');
const JOURNAL_SCAN_DAYS = 2;
const STALE_WINDOW_HOURS = 4;
const STALE_WINDOW_MS = STALE_WINDOW_HOURS * 60 * 60 * 1000;
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

interface JournalRecord {
  ts?: unknown;
  type?: unknown;
  channel?: unknown;
  channelId?: unknown;
  conversationId?: unknown;
  threadName?: unknown;
  sender?: unknown;
  from?: unknown;
  dir?: unknown;
  content?: unknown;
}

interface ChannelAwareness {
  channelId: string;
  channelName: string;
  sender: string;
  lastActivityTs: number;
  topicHint: string;
  score: number;
}

function coerceTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asChannelId(record: JournalRecord): string {
  const value = record.channel ?? record.channelId ?? record.conversationId;
  return typeof value === 'string' ? value.trim() : '';
}

function isCheckpoint(record: JournalRecord): boolean {
  return String(record.type ?? '').toLowerCase() === 'checkpoint';
}

function readRecentJournalRecords(): JournalRecord[] {
  if (!fs.existsSync(JOURNAL_DIR)) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - JOURNAL_SCAN_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const files = fs
    .readdirSync(JOURNAL_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(0, 10) >= cutoffDate)
    .sort();

  const records: JournalRecord[] = [];
  for (const file of files) {
    const fullPath = path.join(JOURNAL_DIR, file);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as JournalRecord;
        records.push(record);
      } catch {
        // Skip malformed lines.
      }
    }
  }

  return records;
}

function isAckMessage(content: string): boolean {
  const normalized = content.trim().toLowerCase().replace(/[.!?]+$/g, '');
  if (!normalized) return true;
  if (ACK_SET.has(normalized)) return true;
  if (normalized.length <= 20 && /^(ok|k|yes|yep|sure|done|thanks)\b/.test(normalized)) return true;
  return false;
}

function topicHint(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'recent updates';
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 80).trimEnd()}…`;
}

function resolveSender(record: JournalRecord): string {
  const sender = typeof record.sender === 'string' && record.sender.trim() ? record.sender.trim() : null;
  if (sender) return sender;
  const from = typeof record.from === 'string' && record.from.trim() ? record.from.trim() : null;
  if (from) return from;
  const dir = String(record.dir ?? '').toLowerCase();
  if (dir === 'in') return 'user';
  if (dir === 'out') return 'agent';
  return 'unknown';
}

function channelName(records: JournalRecord[], fallback: string): string {
  for (let i = records.length - 1; i >= 0; i--) {
    const value = records[i]?.threadName;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function timeAgo(ts: number): string {
  const deltaMs = Math.max(0, Date.now() - ts);
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function freshnessScore(lastActivityTs: number): number {
  const ageMs = Math.max(0, Date.now() - lastActivityTs);
  return Math.exp(-ageMs / STALE_WINDOW_MS);
}

function collectAwarenessEntries(records: JournalRecord[], currentChannelId?: string): ChannelAwareness[] {
  const byChannel = new Map<string, JournalRecord[]>();

  for (const record of records) {
    const channelId = asChannelId(record);
    if (!channelId) continue;
    if (currentChannelId && channelId === currentChannelId) continue;

    const bucket = byChannel.get(channelId) ?? [];
    bucket.push(record);
    byChannel.set(channelId, bucket);
  }

  const now = Date.now();
  const channels: ChannelAwareness[] = [];

  for (const [channelId, channelRecords] of byChannel.entries()) {
    const sorted = [...channelRecords].sort(
      (a, b) => (coerceTimestamp(a.ts) ?? 0) - (coerceTimestamp(b.ts) ?? 0),
    );

    const latestNonCheckpoint = [...sorted]
      .reverse()
      .find((record) => !isCheckpoint(record) && coerceTimestamp(record.ts) !== null);
    if (!latestNonCheckpoint) continue;

    const lastTs = coerceTimestamp(latestNonCheckpoint.ts);
    if (!lastTs) continue;
    if (now - lastTs > STALE_WINDOW_MS) continue;

    const substantive = [...sorted].reverse().find((record) => {
      if (isCheckpoint(record)) return false;
      const content = typeof record.content === 'string' ? record.content.trim() : '';
      if (content.length <= 50) return false;
      return !isAckMessage(content);
    });

    const topic = substantive && typeof substantive.content === 'string'
      ? topicHint(substantive.content)
      : 'active discussion';

    channels.push({
      channelId,
      channelName: channelName(sorted, channelId),
      sender: resolveSender(latestNonCheckpoint),
      lastActivityTs: lastTs,
      topicHint: topic,
      score: freshnessScore(lastTs),
    });
  }

  return channels.sort((a, b) => b.score - a.score || b.lastActivityTs - a.lastActivityTs);
}

function formatAwarenessBlock(entries: ChannelAwareness[]): string {
  const lines = [
    '<!-- Cross-session awareness (auto-generated) -->',
    'Active threads (recent):',
    ...entries.map((entry) => {
      const label = entry.channelName.replace(/^#/, '');
      return `  • #${label}: ${entry.topicHint}, ${entry.sender}, ${timeAgo(entry.lastActivityTs)}`;
    }),
    '<!-- End cross-session awareness -->',
  ];
  return lines.join('\n');
}

export class CrossSessionProvider implements SlotProvider {
  id = 'cross-session';
  source = 'cross-session' as const;
  priority = 30;
  prunable = true;

  available(ctx: SlotContext): boolean {
    const entries = collectAwarenessEntries(readRecentJournalRecords(), ctx.channelId);
    return entries.length > 0;
  }

  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[] {
    if (budgetBytes <= 0) return [];

    const entries = collectAwarenessEntries(readRecentJournalRecords(), ctx.channelId);
    if (entries.length === 0) return [];

    const selected: ChannelAwareness[] = [];
    for (const entry of entries) {
      const candidate = [...selected, entry];
      const block = formatAwarenessBlock(candidate);
      const bytes = Buffer.byteLength(block, 'utf8');
      if (bytes > budgetBytes) break;
      selected.push(entry);
    }

    if (selected.length === 0) return [];

    const content = formatAwarenessBlock(selected);
    const bytes = Buffer.byteLength(content, 'utf8');
    const score = selected.reduce((sum, entry) => sum + entry.score, 0) / selected.length;

    return [
      {
        id: `${this.id}:awareness`,
        source: this.source,
        content,
        score,
        bytes,
        included: true,
        reason: `active-channels:${selected.length}`,
      },
    ];
  }

  prune(slots: ContextSlot[], _targetFreeBytes: number, aggressiveness: number): ContextSlot[] {
    if (aggressiveness > 0.5) return [];
    return slots;
  }
}

export type { ChannelAwareness };
export { collectAwarenessEntries, formatAwarenessBlock, readRecentJournalRecords, timeAgo };
