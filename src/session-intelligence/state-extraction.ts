import type { DatabaseSync } from 'node:sqlite';
import { extractDecisionText, extractProblemText, type ContentType } from './content-type';
import { getStateSlot, upsertStateSlot } from './state-slots';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function getRole(message: unknown): string {
  if (!isRecord(message)) return '';
  return typeof message.role === 'string' ? message.role.toLowerCase() : '';
}

function normalizeDecisions(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function appendDecision(existingContent: string | null, nextDecision: string): string {
  const decisions = existingContent ? normalizeDecisions(existingContent) : [];
  decisions.push(nextDecision.trim());

  if (decisions.length > 10) {
    return decisions.slice(decisions.length - 10).join('\n');
  }

  return decisions.join('\n');
}

export function extractStateFromMessage(params: {
  db: DatabaseSync;
  conversationId: number;
  message: unknown;
  contentType: ContentType;
}): void {
  const { db, conversationId, message, contentType } = params;

  if (contentType === 'decision') {
    const decisionText = extractDecisionText(message);
    if (decisionText === null) return;

    const existing = getStateSlot(db, conversationId, 'decisions_made');
    const next = appendDecision(existing?.content ?? null, decisionText);

    upsertStateSlot(db, conversationId, 'decisions_made', next, {
      loadedFrom: 'extraction',
      isPinned: false,
    });
    return;
  }

  if (contentType === 'active' && getRole(message) === 'user') {
    const problemText = extractProblemText(message);
    if (problemText === null) return;

    upsertStateSlot(db, conversationId, 'active_problem', problemText, {
      loadedFrom: 'extraction',
      isPinned: false,
    });
  }
}
