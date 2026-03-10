/**
 * memory-store.js
 *
 * Loads ClawText cluster JSON files and serves them to the API.
 * Handles the actual on-disk format: { projectId, memories[], builtAt, sourceFiles }
 * where each memory.content is raw YAML frontmatter text.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import yaml from 'js-yaml';
import chokidar from 'chokidar';

// Map raw projectIds to display names
const PROJECT_LABELS = {
  rgcs:            'RGCS',
  clawtext:        'ClawText',
  openclaw:        'OpenClaw',
  moltmud:         'MoltMUD',
  ragefx:          'RageFX',
  'compositor-fx': 'Compositor FX',
  infrastructure:  'Infrastructure',
  hardware:        'Hardware',
  ingestion:       'Ingestion',
  general:         'General',
  default:         'General',
  contractors:     'Contractors',
  security:        'Security',
};

function humanize(id) {
  if (!id) return 'Unknown';
  if (PROJECT_LABELS[id]) return PROJECT_LABELS[id];
  // "contractors-showdown-data-platform" → "Contractors Showdown Data Platform"
  return id.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Parse the YAML frontmatter block that lives in memory.content.
 * Format is like:
 *   date: 2026-03-03
 *   project: rgcs
 *   type: error
 *   entities: [OneEuro, strength, cutoff]
 *   keywords: [smoothing, oneeuro]
 *
 *   ## Section heading
 *   Body text here...
 */
function parseContent(raw) {
  if (!raw || typeof raw !== 'string') return { entities: [], keywords: [], date: null, title: null, body: raw || '' };

  // JSON-content memories (ingested Discord messages, docs, etc.)
  if (raw.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      // Skip raw API call logs (Discord read/write action payloads — not user content)
      if (parsed.action && parsed.handledBy) return { entities: [], keywords: [], date: null, title: null, body: '', _skip: true };
      const textContent = parsed.content || parsed.message || parsed.text || parsed.body || '';
      const lines = textContent.split('\n');
      const heading = lines.find(l => l.startsWith('#'));
      const firstLine = lines.find(l => l.trim().length > 0);
      const title = heading ? heading.replace(/^#+\s*/, '').trim() : (firstLine?.trim().slice(0, 80) || null);
      return {
        entities: [], keywords: [],
        date: parsed.timestamp?.slice(0, 10) || null,
        type: parsed.type || 'ingested',
        project: null, title,
        body: textContent.slice(0, 400),
      };
    } catch {}
  }

  const KNOWN_YAML_KEYS = new Set(['date','project','type','area','entities','keywords','pattern-key','confidence','source','updatedAt']);

  const lines = raw.split('\n');
  const meta = {};
  const extraLines = []; // lines that aren't standard YAML keys → might be content
  let bodyStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('##')) { bodyStart = i; break; }
    const entM = line.match(/^entities:\s*\[([^\]]*)\]/);
    if (entM) { meta.entities = entM[1].split(',').map(s => s.trim()).filter(Boolean); continue; }
    const kwM = line.match(/^keywords?:\s*\[([^\]]*)\]/);
    if (kwM) { meta.keywords = kwM[1].split(',').map(s => s.trim()).filter(Boolean); continue; }
    const dateM = line.match(/^date:\s*(\S+)/);
    if (dateM) { meta.date = dateM[1]; continue; }
    const typeM = line.match(/^type:\s*(\S+)/);
    if (typeM) { meta.type = typeM[1]; continue; }
    const projM = line.match(/^project:\s*(\S+)/);
    if (projM) { meta.project = projM[1]; continue; }
    const pkM = line.match(/^pattern-key:\s*(\S+)/);
    if (pkM) { meta.patternKey = pkM[1]; continue; }
    // Non-empty line that isn't a known YAML key → potential body content
    if (line.trim() && !line.match(/^\w[\w-]*:/)) extraLines.push(line.trim());
  }

  const headingLine = lines.slice(bodyStart).find(l => l.startsWith('##'));
  const bodyLines = lines.slice(bodyStart + (headingLine ? 1 : 0));

  // Build title in priority order:
  // 1. ## heading  2. first body text line  3. pattern-key humanized  4. first extra YAML line
  let title = null;
  if (headingLine) {
    title = headingLine.replace(/^#+\s*/, '').trim();
  } else if (bodyLines.find(l => l.trim())) {
    title = bodyLines.find(l => l.trim()).trim().slice(0, 80);
  } else if (meta.patternKey) {
    // "rgcs.oneeuro_strength_normalization" → "RGCS: OneEuro Strength Normalization"
    const parts = meta.patternKey.split('.');
    const proj = parts[0]?.toUpperCase() || '';
    const desc = (parts[1] || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    title = desc ? `${proj}: ${desc}` : meta.patternKey;
  } else if (extraLines.length) {
    title = extraLines[0].slice(0, 80);
  }

  const body = [
    ...bodyLines,
    ...(extraLines.length && !headingLine && bodyLines.length === 0 ? extraLines : [])
  ].join('\n').trim();

  return {
    entities: meta.entities || [],
    keywords: meta.keywords || [],
    date:     meta.date || null,
    type:     meta.type || null,
    project:  meta.project || null,
    title,
    body,
  };
}

export class MemoryStore {
  constructor(memoryDir) {
    this.memoryDir = memoryDir;
    this.clustersDir = join(memoryDir, 'clusters');
    this.clusters = new Map();   // clusterId → normalized cluster object
    this.memories = [];          // flat list for search
    this.entities = new Map();   // entityName → Set<clusterId>
    this._loadAll();
    this._watch();
  }

  _loadAll() {
    this._loadClusters();
    this._buildEntityIndex();
  }

  _loadClusters() {
    this.clusters.clear();
    this.memories = [];

    if (!existsSync(this.clustersDir)) return;

    let files;
    try { files = readdirSync(this.clustersDir).filter(f => f.endsWith('.json')); }
    catch { return; }

    for (const file of files) {
      try {
        const raw = readFileSync(join(this.clustersDir, file), 'utf8');
        const cluster = JSON.parse(raw);

        // Support both our format (projectId) and generic format (id)
        const id = cluster.projectId || cluster.id || basename(file, '.json');
        const topic = cluster.topic || humanize(id);
        const project = id;

        // Aggregate entities + keywords across all memories
        const allEntities = new Set(cluster.entities || []);
        const allKeywords = new Set(cluster.keywords || []);

        const processedMemories = (cluster.memories || []).map((mem, idx) => {
          const parsed = parseContent(mem.content || '');
          if (parsed._skip) return null;

          parsed.entities.forEach(e => allEntities.add(e));
          parsed.keywords.forEach(k => allKeywords.add(k));
          ;(mem.keywords || []).forEach(k => allKeywords.add(k));

          return {
            _id:          `${id}__${idx}`,
            clusterId:    id,
            clusterTopic: topic,
            project:      parsed.project || mem.project || project,
            type:         parsed.type || mem.type,
            date:         parsed.date || mem.updatedAt?.slice(0, 10) || null,
            title:        parsed.title,
            content:      parsed.body || parsed.title || mem.content?.slice(0, 300) || '',
            _searchText:  [
              parsed.body, parsed.title,
              parsed.entities.join(' '),
              parsed.keywords.join(' '),
              (mem.keywords || []).join(' '),
              mem.content || '',
            ].filter(Boolean).join(' ').toLowerCase(),
            entities:    parsed.entities,
            keywords:    [...new Set([...parsed.keywords, ...(mem.keywords || [])])],
            confidence:  mem.confidence || 0,
            sourceFile:  mem.sourceFile || null,
            updatedAt:   mem.updatedAt || null,
          };
        }).filter(Boolean);

        const normalized = {
          id,
          topic,
          project,
          entities:    [...allEntities],
          keywords:    [...allKeywords],
          memoryCount: processedMemories.length,
          memories:    processedMemories,
          builtAt:     cluster.builtAt || null,
          sourceFiles: cluster.sourceFiles || [],
        };

        this.clusters.set(id, normalized);
        this.memories.push(...processedMemories);
      } catch {
        // skip malformed files
      }
    }
  }

  _buildEntityIndex() {
    this.entities.clear();
    for (const [clusterId, cluster] of this.clusters) {
      const sources = [
        ...(cluster.entities || []),
        ...(cluster.keywords || []),
        cluster.topic,
        cluster.project,
      ].filter(Boolean);

      for (const e of sources) {
        if (!this.entities.has(e)) this.entities.set(e, new Set());
        this.entities.get(e).add(clusterId);
      }
    }
  }

  _watch() {
    const watcher = chokidar.watch(this.clustersDir, {
      ignored: /(^|[/\\])\../,
      persistent: false,
      depth: 1,
    });
    watcher.on('change', () => this._loadAll());
    watcher.on('add',    () => this._loadAll());
    watcher.on('unlink', () => this._loadAll());
  }

  getClusters() { return Array.from(this.clusters.values()); }

  getClusterById(id) { return this.clusters.get(id) ?? null; }

  getAllEntities() { return Array.from(this.entities.keys()).sort(); }

  /**
   * BM25-ish search across all memories.
   */
  search(query, { limit = 20, projectFilter = null } = {}) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return this.memories.slice(0, limit);

    const scored = this.memories.map(mem => {
      let score = 0;
      for (const token of tokens) {
        const count = (mem._searchText.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        score += count * (token.length > 4 ? 2 : 1);
        // Title/entity match bonus
        if (mem.title?.toLowerCase().includes(token)) score += 5;
        if (mem.entities?.some(e => e.toLowerCase().includes(token))) score += 3;
      }
      return { ...mem, _score: score };
    });

    let results = scored.filter(m => m._score > 0).sort((a, b) => b._score - a._score);

    if (projectFilter) results = results.filter(m => m.project === projectFilter);

    return results.slice(0, limit);
  }

  /**
   * Graph: cluster nodes + edges (shared keywords = positive, anti-patterns = negative).
   */
  buildGraph(antiPatternStore) {
    const nodes = [];
    const edges = [];

    for (const [id, cluster] of this.clusters) {
      nodes.push({
        id,
        label: cluster.topic,
        project: cluster.project,
        memoryCount: cluster.memoryCount,
        keywords: cluster.keywords.slice(0, 10),
        entities: cluster.entities.slice(0, 10),
      });
    }

    // Positive edges: shared keywords between clusters
    const clusterList = Array.from(this.clusters.entries());
    for (let i = 0; i < clusterList.length; i++) {
      for (let j = i + 1; j < clusterList.length; j++) {
        const [idA, cA] = clusterList[i];
        const [idB, cB] = clusterList[j];

        const setA = new Set([...(cA.entities || []), ...(cA.keywords || [])].map(s => s.toLowerCase()));
        const setB = new Set([...(cB.entities || []), ...(cB.keywords || [])].map(s => s.toLowerCase()));
        const shared = [...setA].filter(x => x.length > 2 && setB.has(x));

        if (shared.length >= 2) {
          edges.push({ id: `${idA}__${idB}`, source: idA, target: idB, weight: shared.length, shared: shared.slice(0, 5), type: 'positive' });
        }
      }
    }

    // Anti-pattern edges: override or supplement positive edges
    const allPatterns = antiPatternStore.getAll();
    for (const ap of allPatterns) {
      if (ap.status === 'dismissed') continue;
      const srcCluster = this._findClusterByEntity(ap.from);
      const tgtCluster = this._findClusterByEntity(ap.to);
      if (!srcCluster || !tgtCluster) continue;

      const existingIdx = edges.findIndex(e =>
        (e.source === srcCluster && e.target === tgtCluster) ||
        (e.source === tgtCluster && e.target === srcCluster)
      );

      const antiEdge = {
        id: `ap__${ap.id}`,
        source: srcCluster,
        target: tgtCluster,
        weight: 1,
        type: ap.status === 'partial' ? 'partial' : 'negative',
        antiPatternId: ap.id,
        reason: ap.reason,
        partialNote: ap.partialNote,
        shared: [],
      };

      if (existingIdx >= 0) edges[existingIdx] = antiEdge;
      else edges.push(antiEdge);
    }

    return { nodes, edges };
  }

  _findClusterByEntity(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    // Exact topic match
    for (const [id, c] of this.clusters) {
      if (c.topic?.toLowerCase() === lower || c.project?.toLowerCase() === lower) return id;
    }
    // Entity index match
    for (const [entity, clusterIds] of this.entities) {
      if (entity.toLowerCase().includes(lower) || lower.includes(entity.toLowerCase())) {
        return clusterIds.values().next().value;
      }
    }
    return null;
  }

  getStats() {
    return {
      clusterCount: this.clusters.size,
      memoryCount:  this.memories.length,
      entityCount:  this.entities.size,
    };
  }
}
