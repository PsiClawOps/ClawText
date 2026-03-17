import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  ensureLibraryRuntimeDirs,
  type LibraryEntryMetadata,
  type LibraryOverlayMetadata,
} from './library';
import {
  getClawTextLibraryCollectionsDir,
  getClawTextLibraryEntriesDir,
  getClawTextLibraryIndexesDir,
  getClawTextLibraryManifestsDir,
  getClawTextLibraryOverlaysDir,
} from './runtime-paths';

export interface LibraryIndexRecord {
  id: string;
  kind: 'library-entry' | 'collection-doc' | 'library-overlay';
  title: string;
  content: string;
  snippet: string;
  collection?: string;
  topic?: string;
  project?: string;
  trust_level?: string;
  source_type?: string;
  status?: string;
  visibility?: string;
  source?: string;
  file?: string;
  keywords: string[];
  updatedAt?: string;
}

export interface LibraryIndexBuildResult {
  total: number;
  collections: number;
  entries: number;
  overlays: number;
  output: string;
}

function readJson<T = unknown>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function parseFrontmatter(content: string): { metadata: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { metadata: {}, body: content };
  }

  const metadata = (yaml.load(match[1]) as Record<string, unknown>) || {};
  const body = content.slice(match[0].length);
  return { metadata, body };
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeIndexableText(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSnippet(content: string, maxChars = 600): string {
  const normalized = normalizeIndexableText(content);
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars)}...`;
}

function deriveKeywords(...parts: Array<string | string[] | undefined>): string[] {
  const words = new Set<string>();
  parts.flat().filter(Boolean).forEach((part) => {
    const values = Array.isArray(part) ? part : [part];
    values.forEach((value) => {
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token: string) => token.length > 2)
        .forEach((token: string) => words.add(token));
    });
  });
  return Array.from(words).slice(0, 40);
}

export class ClawTextLibraryIndex {
  private workspacePath: string;

  constructor(workspacePath: string = process.env.HOME + '/.openclaw/workspace') {
    this.workspacePath = workspacePath;
    ensureLibraryRuntimeDirs(workspacePath);
  }

  build(): LibraryIndexBuildResult {
    const indexesDir = getClawTextLibraryIndexesDir(this.workspacePath);
    const manifestsDir = getClawTextLibraryManifestsDir(this.workspacePath);
    const entriesDir = getClawTextLibraryEntriesDir(this.workspacePath);
    const overlaysDir = getClawTextLibraryOverlaysDir(this.workspacePath);
    const collectionsDir = getClawTextLibraryCollectionsDir(this.workspacePath);

    const records: LibraryIndexRecord[] = [];
    let collectionCount = 0;
    let entryCount = 0;
    let overlayCount = 0;

    const runtimeManifests = fs.existsSync(manifestsDir)
      ? fs.readdirSync(manifestsDir).filter((file) => file.endsWith('.runtime.json'))
      : [];

    for (const file of runtimeManifests) {
      const runtimeManifest = readJson<Record<string, unknown>>(path.join(manifestsDir, file));
      const collection = String(runtimeManifest.slug || '').trim();
      if (!collection) continue;
      const collectionDir = path.join(collectionsDir, collection);
      if (!fs.existsSync(collectionDir)) continue;

      const trustLevel = typeof runtimeManifest.trust_level === 'string' ? runtimeManifest.trust_level : undefined;
      const sourceType = typeof runtimeManifest.source_type === 'string' ? runtimeManifest.source_type : undefined;
      const topics = ensureStringArray(runtimeManifest.topics);
      const project = typeof runtimeManifest.project === 'string' ? runtimeManifest.project : 'external-reference';
      const status = typeof runtimeManifest.status === 'string' ? runtimeManifest.status : 'active';
      const updatedAt = typeof runtimeManifest.last_ingested === 'string' ? runtimeManifest.last_ingested : undefined;

      const docs = fs.readdirSync(collectionDir).filter((entry) => entry.endsWith('.json'));
      for (const docFile of docs) {
        const doc = readJson<Record<string, unknown>>(path.join(collectionDir, docFile));
        const rawContent = typeof doc.content === 'string' ? doc.content : '';
        const content = normalizeIndexableText(rawContent);
        const title = typeof doc.title === 'string' ? doc.title : `${collection} document`;
        const role = typeof doc.role === 'string' ? doc.role : undefined;
        records.push({
          id: String(doc.id || `${collection}:${docFile}`),
          kind: 'collection-doc',
          title: role ? `${title} — ${role}` : title,
          content,
          snippet: makeSnippet(content),
          collection,
          topic: topics[0],
          project,
          trust_level: trustLevel,
          source_type: sourceType,
          status,
          visibility: typeof runtimeManifest.visibility === 'string' ? runtimeManifest.visibility : 'shared',
          source: typeof doc.url === 'string' ? doc.url : undefined,
          file: path.join(collectionDir, docFile),
          keywords: deriveKeywords(title, role, topics, typeof doc.url === 'string' ? doc.url : undefined, content.slice(0, 800)),
          updatedAt: typeof doc.fetchedAt === 'string' ? doc.fetchedAt : updatedAt,
        });
        collectionCount += 1;
      }
    }

    if (fs.existsSync(entriesDir)) {
      const entryFiles = fs.readdirSync(entriesDir).filter((file) => file.endsWith('.md'));
      for (const file of entryFiles) {
        const fullPath = path.join(entriesDir, file);
        const raw = fs.readFileSync(fullPath, 'utf8');
        const { metadata, body } = parseFrontmatter(raw);
        const entry = metadata as Partial<LibraryEntryMetadata> & Record<string, unknown>;
        const titleMatch = body.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, '');
        records.push({
          id: String(entry.linked_collection || entry.topic || file),
          kind: 'library-entry',
          title,
          content: body.trim(),
          snippet: makeSnippet(body),
          collection: typeof entry.linked_collection === 'string' ? entry.linked_collection : undefined,
          topic: typeof entry.topic === 'string' ? entry.topic : undefined,
          project: typeof entry.project === 'string' ? entry.project : undefined,
          status: typeof entry.status === 'string' ? entry.status : 'active',
          visibility: typeof entry.visibility === 'string' ? entry.visibility : 'shared',
          source: ensureStringArray(entry.source_docs).join(', '),
          file: fullPath,
          keywords: deriveKeywords(title, typeof entry.topic === 'string' ? entry.topic : undefined, ensureStringArray(entry.source_docs), body.slice(0, 600)),
          updatedAt: typeof entry.last_reviewed === 'string' ? entry.last_reviewed : undefined,
        });
        entryCount += 1;
      }
    }

    if (fs.existsSync(overlaysDir)) {
      const overlayFiles = fs.readdirSync(overlaysDir).filter((file) => file.endsWith('.md'));
      for (const file of overlayFiles) {
        const fullPath = path.join(overlaysDir, file);
        const raw = fs.readFileSync(fullPath, 'utf8');
        const { metadata, body } = parseFrontmatter(raw);
        const overlay = metadata as Partial<LibraryOverlayMetadata> & Record<string, unknown>;
        const titleMatch = body.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, '');
        records.push({
          id: String(overlay.slug || file),
          kind: 'library-overlay',
          title,
          content: body.trim(),
          snippet: makeSnippet(body),
          collection: typeof overlay.collection === 'string' ? overlay.collection : undefined,
          topic: typeof overlay.scope === 'string' ? overlay.scope : undefined,
          project: typeof overlay.project === 'string' ? overlay.project : undefined,
          status: typeof overlay.status === 'string' ? overlay.status : 'draft',
          visibility: typeof overlay.visibility === 'string' ? overlay.visibility : 'shared',
          file: fullPath,
          keywords: deriveKeywords(title, typeof overlay.scope === 'string' ? overlay.scope : undefined, body.slice(0, 600)),
          updatedAt: typeof overlay.last_reviewed === 'string' ? overlay.last_reviewed : undefined,
        });
        overlayCount += 1;
      }
    }

    const dedupedMap = new Map<string, LibraryIndexRecord>();
    for (const record of records) {
      const key = record.kind === 'collection-doc'
        ? `${record.kind}:${record.collection || 'library'}:${record.source || record.id}`
        : `${record.kind}:${record.id}`;
      const existing = dedupedMap.get(key);
      if (!existing) {
        dedupedMap.set(key, record);
        continue;
      }

      const existingTs = new Date(existing.updatedAt || 0).getTime();
      const nextTs = new Date(record.updatedAt || 0).getTime();
      if (nextTs >= existingTs) {
        dedupedMap.set(key, record);
      }
    }

    const dedupedRecords = Array.from(dedupedMap.values());
    const collectionRecords = dedupedRecords.filter((record) => record.kind === 'collection-doc');
    const entryRecords = dedupedRecords.filter((record) => record.kind === 'library-entry');
    const overlayRecords = dedupedRecords.filter((record) => record.kind === 'library-overlay');

    const libraryIndexPath = path.join(indexesDir, 'library-index.json');
    const collectionsPath = path.join(indexesDir, 'collections.json');
    const entriesPath = path.join(indexesDir, 'entries.json');
    const overlaysPath = path.join(indexesDir, 'overlays.json');

    fs.writeFileSync(libraryIndexPath, JSON.stringify({ builtAt: new Date().toISOString(), total: dedupedRecords.length, records: dedupedRecords }, null, 2));
    fs.writeFileSync(collectionsPath, JSON.stringify(collectionRecords, null, 2));
    fs.writeFileSync(entriesPath, JSON.stringify(entryRecords, null, 2));
    fs.writeFileSync(overlaysPath, JSON.stringify(overlayRecords, null, 2));

    return {
      total: dedupedRecords.length,
      collections: collectionRecords.length,
      entries: entryRecords.length,
      overlays: overlayRecords.length,
      output: libraryIndexPath,
    };
  }
}
