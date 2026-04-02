/**
 * Session Intelligence ingestion helpers.
 *
 * Persists normalized message rows and raw message-part structure
 * into SQLite while preserving ordering.
 */

import type { DatabaseSync } from 'node:sqlite';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectTextFromPart(part: unknown): string {
  if (!isRecord(part)) return stringifyUnknown(part);

  const text = part.text;
  if (typeof text === 'string') return text;

  const content = part.content;
  if (typeof content === 'string') return content;

  const output = part.output;
  if (typeof output === 'string') return output;

  const result = part.result;
  if (typeof result === 'string') return result;

  return stringifyUnknown(part);
}

function normalizeMessageContent(message: unknown): string {
  if (!isRecord(message)) return stringifyUnknown(message);

  const content = message.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content.map((part) => collectTextFromPart(part)).join('\n').trim();
  }

  const parts = message.parts;
  if (Array.isArray(parts)) {
    return parts.map((part) => collectTextFromPart(part)).join('\n').trim();
  }

  const text = message.text;
  if (typeof text === 'string') return text;

  return stringifyUnknown(content ?? message);
}

function resolveRole(message: unknown): string {
  if (!isRecord(message)) return 'unknown';
  const role = message.role;
  return typeof role === 'string' && role.trim().length > 0 ? role : 'unknown';
}

function coerceRowId(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  throw new Error(`[clawtext-session-intelligence] Unexpected row id type: ${typeof value}`);
}

function extractStatementRowId(runResult: unknown): number {
  if (!isRecord(runResult)) {
    throw new Error('[clawtext-session-intelligence] SQLite run() did not return an object result');
  }

  return coerceRowId(runResult.lastInsertRowid);
}

function omitKnownKeys(part: UnknownRecord): UnknownRecord {
  const copy: UnknownRecord = { ...part };
  delete copy.type;
  delete copy.content;
  delete copy.text;
  delete copy.output;
  delete copy.result;
  return copy;
}

function normalizeParts(message: unknown): Array<{ type: string; content: string | null; metadata: string | null }> {
  if (!isRecord(message)) return [];

  const rawParts = Array.isArray(message.parts)
    ? message.parts
    : Array.isArray(message.content)
      ? message.content
      : [];

  if (rawParts.length === 0) {
    const normalized = normalizeMessageContent(message);
    if (!normalized) return [];
    return [{ type: 'text', content: normalized, metadata: null }];
  }

  return rawParts.map((part): { type: string; content: string | null; metadata: string | null } => {
    if (!isRecord(part)) {
      return {
        type: 'unknown',
        content: stringifyUnknown(part),
        metadata: null,
      };
    }

    const partType = typeof part.type === 'string' && part.type.trim().length > 0 ? part.type : 'unknown';
    const partContent = collectTextFromPart(part);
    const metaObj = omitKnownKeys(part);
    const metadata = Object.keys(metaObj).length > 0 ? stringifyUnknown(metaObj) : null;

    return {
      type: partType,
      content: partContent || null,
      metadata,
    };
  });
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Returns true if the message is an error-state assistant message with no
 * meaningful content (e.g. stopReason === "error" and content is empty).
 * These occur when a provider fails to match a tool call and should not be
 * ingested — they contain no useful signal and can pollute extraction.
 */
function isErrorStub(message: unknown): boolean {
  if (!isRecord(message)) return false;
  const role = message.role;
  if (role !== 'assistant') return false;
  const stopReason = message.stopReason ?? message.stop_reason;
  if (stopReason !== 'error') return false;
  const content = message.content;
  // Empty array content with stopReason=error is the known error-stub pattern
  if (Array.isArray(content) && content.length === 0) return true;
  // Null/undefined content with stopReason=error is also an error stub
  if (content == null) return true;
  return false;
}

export function persistMessage(
  db: DatabaseSync,
  conversationId: number,
  message: unknown,
  index: number,
  isHeartbeat: boolean,
  contentType: string = 'active',
): number {
  if (isErrorStub(message)) {
    throw new Error('[clawtext-session-intelligence] Skipping error-stub message (stopReason=error, empty content)');
  }
  const role = resolveRole(message);
  const content = normalizeMessageContent(message);
  const tokenCount = estimateTokens(content);

  // Preserve the full original message JSON so assemble() can reconstruct
  // structured messages (e.g. toolResult with toolCallId/toolName) faithfully.
  let rawMessage: string | null = null;
  try {
    rawMessage = JSON.stringify(message);
  } catch {
    // non-serializable message — raw_message stays null, assemble() falls back
  }

  const result = db
    .prepare(
      `INSERT INTO messages
        (conversation_id, role, content, content_type, token_count, message_index, is_heartbeat, created_at, raw_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      conversationId,
      role,
      content,
      contentType,
      tokenCount,
      index,
      isHeartbeat ? 1 : 0,
      new Date().toISOString(),
      rawMessage,
    );

  return extractStatementRowId(result);
}

export function persistMessageParts(db: DatabaseSync, messageId: number, message: unknown): void {
  const parts = normalizeParts(message);
  if (parts.length === 0) return;

  const stmt = db.prepare(
    `INSERT INTO message_parts
      (message_id, part_type, content, metadata)
     VALUES (?, ?, ?, ?)`,
  );

  for (const part of parts) {
    stmt.run(messageId, part.type, part.content, part.metadata);
  }
}
