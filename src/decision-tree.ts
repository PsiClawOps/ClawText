import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface DecisionTreeEntry {
  id: string;
  trigger: string;
  triggerKeywords: string[];
  steps: string[];
  learnedFrom: Array<{ date: string; note: string }>;
  confidence: number;
  lastUsed: string;
  lastUpdated: string;
  category: string;
}

export interface DecisionTreeStore {
  entries: DecisionTreeEntry[];
  version: number;
  lastUpdated: string;
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'your',
  'when',
  'then',
  'than',
  'have',
  'has',
  'had',
  'was',
  'were',
  'will',
  'shall',
  'can',
  'could',
  'would',
  'should',
  'about',
  'after',
  'before',
  'during',
  'through',
  'over',
  'under',
  'onto',
  'once',
  'twice',
  'just',
  'only',
  'also',
  'very',
  'more',
  'most',
  'some',
  'same',
  'each',
  'every',
  'step',
]);

function nowIso(): string {
  return new Date().toISOString();
}

function defaultStore(): DecisionTreeStore {
  return {
    entries: [],
    version: 1,
    lastUpdated: nowIso(),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeDate(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ts = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(ts);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return nowIso();
}

function extractKeywords(text: string): string[] {
  const parts = text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOPWORDS.has(token));

  return [...new Set(parts)].slice(0, 16);
}

function normalizeSteps(steps: string[]): string[] {
  return steps
    .map((step) => step.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function generateId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function categoryFromText(text: string): string {
  const lower = text.toLowerCase();
  if (/deploy|release|publish|rollout|build/.test(lower)) return 'deployment';
  if (/debug|error|fail|fix|trace|bug/.test(lower)) return 'debugging';
  if (/arch|design|schema|interface|pattern/.test(lower)) return 'architecture';
  if (/test|qa|verify|assert/.test(lower)) return 'testing';
  return 'operations';
}

function parseStepsFromText(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines
    .map((line) => {
      const match = line.match(/^(?:\d+[\).]|[-*])\s+(.+)$/);
      return match ? match[1].trim() : '';
    })
    .filter(Boolean);

  return normalizeSteps(bulletLines);
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function getRecordSteps(record: Record<string, unknown>): string[] {
  const candidateKeys = ['steps', 'actions', 'nextSteps', 'procedure', 'workflow'];
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const parsed = normalizeSteps(value.map((item) => stringifyUnknown(item)));
      if (parsed.length >= 2) return parsed;
    }
  }

  const content = stringifyUnknown(record.content) || stringifyUnknown(record.message) || stringifyUnknown(record.note);
  const fromText = parseStepsFromText(content);
  return fromText.length >= 2 ? fromText : [];
}

function getRecordNote(record: Record<string, unknown>): string {
  const content = stringifyUnknown(record.content);
  const note = stringifyUnknown(record.note);
  const summary = stringifyUnknown(record.summary);
  const merged = content || note || summary || '[journal record]';
  return merged.length > 180 ? `${merged.slice(0, 177)}...` : merged;
}

function getRecordDate(record: Record<string, unknown>): string {
  const maybeDate = record.date ?? record.ts ?? record.timestamp ?? record.time;
  return safeDate(maybeDate);
}

export class DecisionTreeManager {
  private readonly storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  load(): DecisionTreeStore {
    this.ensureStore();

    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DecisionTreeStore>;
      const entries = Array.isArray(parsed.entries)
        ? parsed.entries
            .map((entry) => this.normalizeEntry(entry))
            .filter((entry): entry is DecisionTreeEntry => Boolean(entry))
        : [];

      return {
        entries,
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        lastUpdated: safeDate(parsed.lastUpdated),
      };
    } catch {
      const fallback = defaultStore();
      this.save(fallback);
      return fallback;
    }
  }

  save(store: DecisionTreeStore): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const normalized: DecisionTreeStore = {
      entries: (store.entries ?? [])
        .map((entry) => this.normalizeEntry(entry))
        .filter((entry): entry is DecisionTreeEntry => Boolean(entry)),
      version: typeof store.version === 'number' ? store.version : 1,
      lastUpdated: nowIso(),
    };

    fs.writeFileSync(this.storePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  }

  addEntry(entry: Omit<DecisionTreeEntry, 'id' | 'lastUpdated'>): DecisionTreeEntry {
    const store = this.load();
    const created: DecisionTreeEntry = {
      id: generateId(),
      trigger: entry.trigger.trim(),
      triggerKeywords:
        entry.triggerKeywords && entry.triggerKeywords.length > 0
          ? [...new Set(entry.triggerKeywords.map((k) => k.toLowerCase()))]
          : extractKeywords(entry.trigger),
      steps: normalizeSteps(entry.steps),
      learnedFrom: (entry.learnedFrom ?? []).map((item) => ({
        date: safeDate(item.date),
        note: String(item.note ?? '').trim(),
      })),
      confidence: clamp01(entry.confidence),
      lastUsed: safeDate(entry.lastUsed),
      lastUpdated: nowIso(),
      category: entry.category.trim() || 'operations',
    };

    store.entries.push(created);
    this.save(store);
    return created;
  }

  updateEntry(id: string, updates: Partial<DecisionTreeEntry>): void {
    const store = this.load();
    const index = store.entries.findIndex((entry) => entry.id === id);
    if (index < 0) {
      throw new Error(`Decision tree entry not found: ${id}`);
    }

    const current = store.entries[index];
    const merged: DecisionTreeEntry = {
      ...current,
      ...updates,
      id: current.id,
      triggerKeywords:
        updates.triggerKeywords && updates.triggerKeywords.length > 0
          ? [...new Set(updates.triggerKeywords.map((k) => k.toLowerCase()))]
          : updates.trigger
            ? extractKeywords(updates.trigger)
            : current.triggerKeywords,
      steps: updates.steps ? normalizeSteps(updates.steps) : current.steps,
      learnedFrom: updates.learnedFrom
        ? updates.learnedFrom.map((item) => ({ date: safeDate(item.date), note: String(item.note ?? '').trim() }))
        : current.learnedFrom,
      confidence: updates.confidence !== undefined ? clamp01(updates.confidence) : current.confidence,
      lastUsed: updates.lastUsed ? safeDate(updates.lastUsed) : current.lastUsed,
      lastUpdated: nowIso(),
      category: updates.category?.trim() || current.category,
      trigger: updates.trigger?.trim() || current.trigger,
    };

    store.entries[index] = merged;
    this.save(store);
  }

  removeEntry(id: string): void {
    const store = this.load();
    store.entries = store.entries.filter((entry) => entry.id !== id);
    this.save(store);
  }

  match(content: string, topN = 5): DecisionTreeEntry[] {
    const keywords = new Set(extractKeywords(content));
    if (keywords.size === 0) return [];

    const store = this.load();
    const scored = store.entries
      .map((entry) => {
        const entryKeywords = entry.triggerKeywords.length > 0 ? entry.triggerKeywords : extractKeywords(entry.trigger);
        const overlap = entryKeywords.filter((kw) => keywords.has(kw)).length;
        if (overlap <= 0) return null;

        const overlapScore = overlap / Math.max(1, entryKeywords.length);
        const score = overlapScore * 0.7 + entry.confidence * 0.3;
        return { entry, score, overlap };
      })
      .filter((item): item is { entry: DecisionTreeEntry; score: number; overlap: number } => Boolean(item))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.overlap - a.overlap ||
          b.entry.confidence - a.entry.confidence ||
          Date.parse(b.entry.lastUsed) - Date.parse(a.entry.lastUsed),
      );

    const limit = Math.max(1, topN);
    return scored.slice(0, limit).map((item) => item.entry);
  }

  extractFromJournal(journalRecords: Array<Record<string, unknown>>): DecisionTreeEntry[] {
    const grouped = new Map<
      string,
      { steps: string[]; occurrences: Array<{ date: string; note: string; rawText: string }> }
    >();

    for (const record of journalRecords) {
      const steps = getRecordSteps(record);
      if (steps.length < 2) continue;

      const key = steps.map((step) => step.toLowerCase()).join(' || ');
      const note = getRecordNote(record);
      const date = getRecordDate(record);
      const rawText = `${note} ${steps.join(' ')}`;

      const existing = grouped.get(key) ?? { steps, occurrences: [] };
      existing.occurrences.push({ date, note, rawText });
      grouped.set(key, existing);
    }

    const extracted: DecisionTreeEntry[] = [];

    for (const [, group] of grouped.entries()) {
      if (group.occurrences.length < 3) continue;

      const allText = group.occurrences.map((item) => item.rawText).join(' ');
      const triggerKeywords = extractKeywords(allText).slice(0, 8);
      const trigger = triggerKeywords.length > 0
        ? `when handling ${triggerKeywords.slice(0, 4).join(' ')}`
        : `when executing ${group.steps[0].toLowerCase()}`;

      const lastUsed = group.occurrences
        .map((item) => item.date)
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? nowIso();

      const confidence = clamp01(0.45 + group.occurrences.length * 0.12);
      const learnedFrom = group.occurrences.slice(0, 6).map((item) => ({
        date: item.date,
        note: item.note,
      }));

      extracted.push({
        id: generateId(),
        trigger,
        triggerKeywords: triggerKeywords.length > 0 ? triggerKeywords : extractKeywords(trigger),
        steps: group.steps,
        learnedFrom,
        confidence,
        lastUsed,
        lastUpdated: nowIso(),
        category: categoryFromText(`${trigger} ${group.steps.join(' ')}`),
      });
    }

    return extracted.sort((a, b) => b.confidence - a.confidence);
  }

  private ensureStore(): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.storePath)) {
      this.save(defaultStore());
    }
  }

  private normalizeEntry(entry: unknown): DecisionTreeEntry | null {
    if (!entry || typeof entry !== 'object') return null;

    const candidate = entry as Partial<DecisionTreeEntry>;
    const trigger = String(candidate.trigger ?? '').trim();
    const steps = normalizeSteps(Array.isArray(candidate.steps) ? candidate.steps.map((item) => String(item)) : []);
    if (!trigger || steps.length === 0) return null;

    return {
      id: String(candidate.id ?? generateId()),
      trigger,
      triggerKeywords:
        Array.isArray(candidate.triggerKeywords) && candidate.triggerKeywords.length > 0
          ? [...new Set(candidate.triggerKeywords.map((item) => String(item).toLowerCase().trim()).filter(Boolean))]
          : extractKeywords(trigger),
      steps,
      learnedFrom: Array.isArray(candidate.learnedFrom)
        ? candidate.learnedFrom.map((item) => ({
            date: safeDate(item?.date),
            note: String(item?.note ?? '').trim(),
          }))
        : [],
      confidence: clamp01(candidate.confidence ?? 0.5),
      lastUsed: safeDate(candidate.lastUsed),
      lastUpdated: safeDate(candidate.lastUpdated),
      category: String(candidate.category ?? 'operations').trim() || 'operations',
    };
  }
}
