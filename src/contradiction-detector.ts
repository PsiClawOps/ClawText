const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'for',
  'in',
  'on',
  'with',
  'is',
  'are',
  'was',
  'were',
  'it',
  'that',
  'this',
  'we',
  'our',
  'be',
  'by',
  'as',
  'at',
]);

const DECISION_CUES = [/\bdecided\b/i, /\bthe approach is\b/i, /\bwe(?:'|’)ll go with\b/i, /\bthe plan is\b/i];
const EXPLICIT_SUPERSEDE = [/\binstead of\b/i, /\bchanged to\b/i, /\bno longer\b/i, /\bsuperseded\b/i];
const NEGATIONS = new Set(['not', 'no', 'never', 'without', "don't", 'dont', "isn't", 'isnt']);

function tokenize(content: string): string[] {
  return content
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function decisionLike(content: string): boolean {
  return DECISION_CUES.some((rx) => rx.test(content));
}

function sharedKeywords(a: string, b: string): string[] {
  const setA = new Set(tokenize(a));
  return tokenize(b).filter((token) => setA.has(token));
}

function hasNegationNearKeyword(content: string, keyword: string): boolean {
  const tokens = content.toLowerCase().split(/\s+/g);
  const idx = tokens.findIndex((token) => token.replace(/[^a-z0-9_]/g, '') === keyword);
  if (idx < 0) return false;

  const start = Math.max(0, idx - 3);
  const end = Math.min(tokens.length - 1, idx + 3);
  for (let i = start; i <= end; i += 1) {
    const token = tokens[i].replace(/[^a-z0-9_']/g, '');
    if (NEGATIONS.has(token)) return true;
  }
  return false;
}

function conclusionFragment(content: string): string {
  const lower = content.toLowerCase();
  const cues = ['the approach is', "we'll go with", 'we decided', 'the plan is', 'changed to'];
  const pos = cues.map((cue) => lower.indexOf(cue)).filter((v) => v >= 0).sort((a, b) => a - b)[0];
  if (typeof pos === 'number') {
    return content.slice(pos).split(/[.!?\n]/)[0].trim().toLowerCase();
  }
  return content.split(/[.!?\n]/)[0].trim().toLowerCase();
}

export function contradicts(oldMessage: string, recentMessages: string[]): boolean {
  if (!oldMessage.trim()) return false;
  const oldIsDecision = decisionLike(oldMessage);
  if (!oldIsDecision) return false;

  for (const recent of recentMessages) {
    if (!recent || !decisionLike(recent)) continue;

    const overlap = sharedKeywords(oldMessage, recent);
    if (overlap.length === 0) continue;

    if (EXPLICIT_SUPERSEDE.some((rx) => rx.test(recent))) {
      return true;
    }

    if (overlap.some((keyword) => hasNegationNearKeyword(recent, keyword))) {
      return true;
    }

    const oldConclusion = conclusionFragment(oldMessage);
    const newConclusion = conclusionFragment(recent);
    if (oldConclusion && newConclusion && oldConclusion !== newConclusion) {
      const contradictoryTone = /\b(instead|changed|no longer|not)\b/.test(newConclusion);
      if (contradictoryTone) {
        return true;
      }
    }
  }

  return false;
}
