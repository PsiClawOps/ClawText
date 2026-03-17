export type ContentType = 'decision' | 'spec' | 'discussion' | 'ack' | 'noise';

export interface ContentTypeResult {
  type: ContentType;
  confidence: number;
  halfLifeDays: number;
}

const DECISION_PATTERNS = [
  /\bdecided\b/i,
  /\bthe approach is\b/i,
  /\bwe(?:'|’)ll go with\b/i,
  /\bthe plan is\b/i,
];

const SPEC_PATTERNS = [
  /```[\s\S]*?```/m,
  /\binterface\s+[A-Za-z0-9_]+/,
  /\btype\s+[A-Za-z0-9_]+\s*=/,
  /\barchitecture\b/i,
  /\bapi\b/i,
  /\bcontract\b/i,
];

const NOISE_PATTERNS = [
  /\bheartbeat\b/i,
  /\braw log\b/i,
  /^\[[A-Z_]+\]/m,
  /\b(system|daemon|telemetry)\s+message\b/i,
  /\btraceback\b/i,
  /\bstdout\b/i,
  /\bstderr\b/i,
];

const ACK_PHRASES = new Set([
  'ok',
  'okay',
  'yes',
  'sounds good',
  'lets do it',
  "let's do it",
  'perfect',
  'nice',
  'got it',
]);

const HALF_LIFE: Record<ContentType, number> = {
  decision: Number.POSITIVE_INFINITY,
  spec: 180,
  discussion: 60,
  ack: 0,
  noise: 0,
};

function normalized(content: string): string {
  return content.trim().toLowerCase().replace(/[.!?]+$/g, '');
}

export function classifyContentType(content: string): ContentTypeResult {
  const raw = String(content ?? '');
  const body = raw.trim();
  const lc = normalized(body);

  if (!body) {
    return { type: 'noise', confidence: 0.95, halfLifeDays: HALF_LIFE.noise };
  }

  if (NOISE_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'noise', confidence: 0.85, halfLifeDays: HALF_LIFE.noise };
  }

  if (body.length < 30 && ACK_PHRASES.has(lc)) {
    return { type: 'ack', confidence: 0.95, halfLifeDays: HALF_LIFE.ack };
  }

  if (DECISION_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'decision', confidence: 0.9, halfLifeDays: HALF_LIFE.decision };
  }

  if (SPEC_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'spec', confidence: 0.82, halfLifeDays: HALF_LIFE.spec };
  }

  if (/\?$/.test(body) || /\b(why|how|maybe|could|should|explore|question)\b/i.test(body)) {
    return { type: 'discussion', confidence: 0.75, halfLifeDays: HALF_LIFE.discussion };
  }

  return { type: 'discussion', confidence: 0.6, halfLifeDays: HALF_LIFE.discussion };
}
