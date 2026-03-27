import type { DatabaseSync } from 'node:sqlite';

export type CallType = 'read' | 'write' | 'exec' | 'search' | 'action' | 'unknown';

type ToolMetaInsert = {
  messageId: string;
  conversationId: string;
  callId?: string;
  callType: CallType;
  resourceUri?: string;
  resultTokens: number;
  turnNumber: number;
  decayEligibleTurn: number;
};

type DecayEligibleRow = {
  messageId: string;
  callType: CallType;
  resultTokens: number;
};

type ToolCallMetaJoinedRow = {
  message_id: string;
  turn_number: number;
  content: string | null;
  truncated_payload_ref: string | null;
};

type CandidateMessageRow = {
  message_index: number;
  content: string;
};

const STRUCTURAL_PATTERNS: RegExp[] = [
  /^based on the\b/i,
  /^the output shows\b/i,
  /^according to the file\b/i,
  /^the command returned\b/i,
];

export const DECAY_WINDOWS: Record<CallType, number> = {
  action: 1,
  exec: 2,
  write: 2,
  read: 5,
  search: 8,
  unknown: 3,
};

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseCallType(value: string): CallType {
  if (value === 'read' || value === 'write' || value === 'exec' || value === 'search' || value === 'action') {
    return value;
  }
  return 'unknown';
}

function resolveDbConversationId(db: DatabaseSync, sessionConversationId: string): number | null {
  const row = db
    .prepare('SELECT id FROM conversations WHERE session_key = ? LIMIT 1')
    .get(sessionConversationId) as { id: number } | undefined;

  return row?.id ?? null;
}

function extractFingerprint(content: string | null, truncatedPayloadRef: string | null): string | null {
  if (typeof content !== 'string' || content.length === 0) return null;
  if (typeof truncatedPayloadRef === 'string' && truncatedPayloadRef.trim().length > 0) return null;

  const normalized = normalize(content.slice(0, 200));
  if (normalized.length < 24) return null;
  return normalized;
}

export function detectCallType(content: string, role: string): CallType {
  const normalized = normalize(content);

  if (/\b(read_file|readfile|\bcat\b)\b/.test(normalized)) return 'read';
  if (/\b(write_file|writefile)\b/.test(normalized)) return 'write';
  if (/\b(web_search|search|brave)\b/.test(normalized)) return 'search';
  if (/\b(send_message|post|create)\b/.test(normalized)) return 'action';

  if (role.trim().toLowerCase() === 'tool') return 'exec';
  if (/\b(exec|bash|shell|command)\b/.test(normalized)) return 'exec';

  return 'unknown';
}

export function insertToolCallMeta(db: DatabaseSync, meta: ToolMetaInsert): void {
  db
    .prepare(
      `INSERT INTO tool_call_meta (
        message_id,
        conversation_id,
        call_id,
        call_type,
        resource_uri,
        result_tokens,
        turn_number,
        decay_eligible_turn,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      meta.messageId,
      meta.conversationId,
      meta.callId ?? null,
      meta.callType,
      meta.resourceUri ?? null,
      meta.resultTokens,
      meta.turnNumber,
      meta.decayEligibleTurn,
      new Date().toISOString(),
    );
}

export function markConsumed(db: DatabaseSync, messageId: string, consumptionTurn: number): void {
  db
    .prepare(
      `UPDATE tool_call_meta
          SET consumed = 1,
              consumption_turn = ?
        WHERE message_id = ?
          AND consumed = 0`,
    )
    .run(consumptionTurn, messageId);
}

export function getDecayEligibleMessages(
  db: DatabaseSync,
  conversationId: string,
  currentTurn: number,
): DecayEligibleRow[] {
  const rows = db
    .prepare(
      `SELECT t.message_id, t.call_type, COALESCE(t.result_tokens, m.token_count, 0) AS result_tokens
         FROM tool_call_meta t
         INNER JOIN messages m
           ON CAST(m.id AS TEXT) = t.message_id
         INNER JOIN conversations c
           ON c.id = m.conversation_id
        WHERE t.conversation_id = ?
          AND c.session_key = ?
          AND t.consumed = 0
          AND t.externalized = 0
          AND t.decay_eligible_turn <= ?
          AND m.content_type = 'tool_result'
          AND (m.truncated_payload_ref IS NULL OR m.truncated_payload_ref = '')
        ORDER BY t.turn_number ASC`,
    )
    .all(conversationId, conversationId, currentTurn) as Array<{
    message_id: string;
    call_type: string;
    result_tokens: number | null;
  }>;

  return rows.map((row) => ({
    messageId: row.message_id,
    callType: parseCallType(row.call_type),
    resultTokens: typeof row.result_tokens === 'number' ? row.result_tokens : 0,
  }));
}

export function markExternalized(db: DatabaseSync, messageId: string): void {
  db
    .prepare(
      `UPDATE tool_call_meta
          SET externalized = 1
        WHERE message_id = ?`,
    )
    .run(messageId);
}

export function detectConsumption(
  db: DatabaseSync,
  conversationId: string,
  afterTurn: number,
  maxTurnsToCheck: number,
): void {
  if (!Number.isFinite(maxTurnsToCheck) || maxTurnsToCheck <= 0) return;

  const dbConversationId = resolveDbConversationId(db, conversationId);
  if (dbConversationId === null) return;

  const endTurn = afterTurn + Math.floor(maxTurnsToCheck);

  const candidateMessages = db
    .prepare(
      `SELECT message_index, content
         FROM messages
        WHERE conversation_id = ?
          AND message_index > ?
          AND message_index <= ?
        ORDER BY message_index ASC`,
    )
    .all(dbConversationId, afterTurn, endTurn) as CandidateMessageRow[];

  if (candidateMessages.length === 0) return;

  const trackedToolMessages = db
    .prepare(
      `SELECT t.message_id, t.turn_number, m.content, m.truncated_payload_ref
         FROM tool_call_meta t
         LEFT JOIN messages m ON CAST(m.id AS TEXT) = t.message_id
        WHERE t.conversation_id = ?
          AND t.consumed = 0
          AND t.turn_number <= ?
        ORDER BY t.turn_number ASC`,
    )
    .all(conversationId, endTurn) as ToolCallMetaJoinedRow[];

  for (const toolRow of trackedToolMessages) {
    const fingerprint = extractFingerprint(toolRow.content, toolRow.truncated_payload_ref);

    for (const messageRow of candidateMessages) {
      if (messageRow.message_index <= toolRow.turn_number) continue;

      const normalizedContent = normalize(messageRow.content);
      const lexicalMatch = typeof fingerprint === 'string' && normalizedContent.includes(fingerprint);
      const structuralMatch = STRUCTURAL_PATTERNS.some((pattern) => pattern.test(messageRow.content.trim()));

      if (lexicalMatch || structuralMatch) {
        markConsumed(db, toolRow.message_id, messageRow.message_index);
        break;
      }
    }
  }
}
