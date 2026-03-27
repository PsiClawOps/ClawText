/**
 * Session Intelligence content type taxonomy.
 *
 * Types are ordered by preservation priority (highest first):
 * anchor > decision > active > tool_result > noise > resolved
 */

export type ContentType =
  | 'anchor'
  | 'decision'
  | 'active'
  | 'tool_result'
  | 'noise'
  | 'resolved';

export const CONTENT_TYPE_PRIORITY: Record<ContentType, number> = {
  anchor: 100,
  decision: 80,
  active: 60,
  tool_result: 40,
  noise: 20,
  resolved: 10,
};

export const CONTENT_TYPE_COMPACTION_ORDER: ContentType[] = [
  'noise',
  'resolved',
  'tool_result',
  'active',
  'decision',
  'anchor',
];

const DECISION_PATTERNS: RegExp[] = [
  /\b(decided|decision|we('ll| will) (go|use|build|implement)|chosen|agreed|confirmed|committing to|going with)\b/i,
  /\b(the plan is|final answer|conclusion:|action item:|next step:)\b/i,
];

const PROBLEM_START_PATTERN = /^(need to|how do|why is|fix|debug|investigate)\b/i;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? '');
  }
}

function readRole(message: unknown): string {
  if (!isRecord(message)) return '';
  const role = message.role;
  return typeof role === 'string' ? role : '';
}

function collectTextFromPart(part: unknown): string {
  if (!isRecord(part)) return stringifyUnknown(part);

  if (typeof part.text === 'string') return part.text;
  if (typeof part.content === 'string') return part.content;
  if (typeof part.output === 'string') return part.output;
  if (typeof part.result === 'string') return part.result;

  return stringifyUnknown(part);
}

function readContent(message: unknown): string {
  if (!isRecord(message)) return stringifyUnknown(message);

  if (typeof message.content === 'string') return message.content;
  if (typeof message.text === 'string') return message.text;

  if (Array.isArray(message.content)) {
    return message.content.map((part) => collectTextFromPart(part)).join('\n').trim();
  }

  if (Array.isArray(message.parts)) {
    return message.parts.map((part) => collectTextFromPart(part)).join('\n').trim();
  }

  return stringifyUnknown(message.content ?? message);
}

function hasToolCalls(message: unknown): boolean {
  if (!isRecord(message)) return false;

  const directToolCalls = message.tool_calls;
  if (Array.isArray(directToolCalls) && directToolCalls.length > 0) return true;

  if (Array.isArray(message.parts)) {
    return message.parts.some((part) => {
      if (!isRecord(part)) return false;
      const partToolCalls = part.tool_calls;
      return Array.isArray(partToolCalls) && partToolCalls.length > 0;
    });
  }

  return false;
}

function hasDecisionPattern(content: string): boolean {
  return DECISION_PATTERNS.some((pattern) => pattern.test(content));
}

function clip200(value: string): string {
  return value.slice(0, 200).trim();
}

function toSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function classifyMessage(message: unknown): ContentType {
  const role = readRole(message).toLowerCase();
  const content = readContent(message);

  if (
    role === 'tool'
    || (role === 'assistant' && hasToolCalls(message))
    || content.includes('<tool_result>')
    || content.includes('"type":"tool_result"')
  ) {
    return 'tool_result';
  }

  if (/heartbeat/i.test(content) || /HEARTBEAT_OK/.test(content)) {
    return 'noise';
  }

  if (role === 'system') {
    return 'anchor';
  }

  if (hasDecisionPattern(content)) {
    return 'decision';
  }

  return 'active';
}

export function extractDecisionText(message: unknown): string | null {
  const role = readRole(message).toLowerCase();
  if (role !== 'assistant') return null;

  const content = readContent(message).trim();
  if (content.length === 0 || !hasDecisionPattern(content)) return null;

  const sentences = toSentences(content);
  for (const sentence of sentences) {
    if (hasDecisionPattern(sentence)) {
      return clip200(sentence);
    }
  }

  return clip200(content);
}

export function extractProblemText(message: unknown): string | null {
  const role = readRole(message).toLowerCase();
  if (role !== 'user') return null;

  const content = readContent(message).trim();
  if (content.length === 0) return null;

  const questions = content.match(/[^?\n]*\?/g);
  if (Array.isArray(questions)) {
    const question = questions
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);

    if (typeof question === 'string') {
      return clip200(question);
    }
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (PROBLEM_START_PATTERN.test(line)) {
      return clip200(line);
    }
  }

  const sentences = toSentences(content);
  for (const sentence of sentences) {
    if (PROBLEM_START_PATTERN.test(sentence)) {
      return clip200(sentence);
    }
  }

  return null;
}
