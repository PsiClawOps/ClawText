import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Memory {
  id?: string;
  content: string;
  type: string;
  source: string;
  project: string;
  confidence: number;
  keywords: string[];
  updatedAt: string;
  sourceType?: string;
  createdAt?: string;
  dedupeHash?: string;
  sourceFile?: string;
}

interface Cluster {
  builtAt: string;
  projectId: string;
  memories: Memory[];
}

/**
 * RAG layer for ClawText memory injection
 * Reads pre-built clusters and injects top N memories into prompt context
 */
export class ClawTextRAG {
  private clustersDir: string;
  private clusters: Map<string, Cluster> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments: number = 0;
  private avgDocLength: number = 100;
  private config: {
    enabled: boolean;
    maxMemories: number;
    minConfidence: number;
    injectMode: 'smart' | 'full' | 'snippets' | 'off';
    tokenBudget: number;
    contextLibrarianEnabled: boolean;
    contextLibrarianMaxSelect: number;
    contextLibrarianAlwaysIncludeRecent: number;
  };

  constructor(workspacePath: string = process.env.HOME + '/.openclaw/workspace') {
    this.clustersDir = path.join(workspacePath, 'memory', 'clusters');
    this.config = {
      enabled: true,
      maxMemories: 5,
      minConfidence: 0.6,
      injectMode: 'smart',
      tokenBudget: 4000,
      contextLibrarianEnabled: process.env.CLAWTEXT_CONTEXT_LIBRARIAN_ENABLED === 'true',
      contextLibrarianMaxSelect: 4,
      contextLibrarianAlwaysIncludeRecent: 1,
    };

    this.loadClusters();
  }

  /**
   * Load all cluster files into memory (O(1) lookup)
   * Also computes document frequency stats for BM25 scoring.
   */
  private loadClusters(): void {
    if (!fs.existsSync(this.clustersDir)) {
      console.warn(`Clusters directory not found: ${this.clustersDir}`);
      return;
    }

    const files = fs.readdirSync(this.clustersDir).filter(f => f.startsWith('cluster-'));

    files.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.clustersDir, file), 'utf8'));
        const projectId = data.projectId || path.basename(file, '.json').replace('cluster-', '');
        this.clusters.set(projectId, data);
      } catch (e) {
        console.error(`Failed to load cluster ${file}:`, e);
      }
    });

    // Compute document frequency stats for BM25
    let totalLen = 0;
    this.totalDocuments = 0;
    this.documentFrequency.clear();

    this.clusters.forEach(cluster => {
      for (const mem of cluster.memories) {
        this.totalDocuments++;
        const tokens = (mem.content + ' ' + mem.keywords.join(' ')).toLowerCase().split(/\s+/);
        totalLen += tokens.length;
        const uniqueTerms = new Set(tokens.filter(t => t.length > 2));
        for (const term of uniqueTerms) {
          this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1);
        }
      }
    });

    this.avgDocLength = this.totalDocuments > 0 ? totalLen / this.totalDocuments : 100;
    console.log(`[ClawText RAG] Loaded ${this.clusters.size} clusters, ${this.totalDocuments} docs, avgLen=${Math.round(this.avgDocLength)}`);
  }

  /**
   * Search memories by keywords using BM25 scoring with TF-IDF weighting.
   * k1 controls term frequency saturation; b controls document length normalization.
   */
  private bm25Score(query: string, memory: Memory): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const memoryText = (memory.content + ' ' + memory.keywords.join(' ')).toLowerCase();
    const memoryTokens = memoryText.split(/\s+/);
    const docLen = memoryTokens.length;

    // BM25 parameters
    const k1 = 1.5;
    const b = 0.75;

    // Average document length across all loaded clusters (rough estimate)
    const avgDl = this.avgDocLength || 100;

    let score = 0;
    for (const term of queryTerms) {
      // Term frequency in this document
      let tf = 0;
      for (const tok of memoryTokens) {
        if (tok === term || tok.includes(term)) tf++;
      }
      if (tf === 0) continue;

      // Inverse document frequency (approximated from loaded clusters)
      const df = this.documentFrequency.get(term) || 1;
      const totalDocs = this.totalDocuments || 1;
      const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

      // BM25 formula
      const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDl)));
      score += idf * tfNorm;
    }

    // Boost by confidence
    score *= memory.confidence;

    return score;
  }

  /**
   * Parse time expressions from query and return a date filter.
   * Supports: "last week", "this month", "last 7 days", "since 2026-03-01", "today", "yesterday"
   */
  private parseTimeFilter(query: string): { after?: Date; before?: Date } | null {
    const lower = query.toLowerCase();
    const now = new Date();

    // "today"
    if (/\btoday\b/.test(lower)) {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { after: start };
    }
    // "yesterday"
    if (/\byesterday\b/.test(lower)) {
      const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(0, 0, 0, 0);
      return { after: start, before: end };
    }
    // "last N days/weeks/months"
    const lastN = lower.match(/last\s+(\d+)\s+(day|week|month)s?/);
    if (lastN) {
      const n = parseInt(lastN[1]);
      const unit = lastN[2];
      const start = new Date(now);
      if (unit === 'day') start.setDate(start.getDate() - n);
      else if (unit === 'week') start.setDate(start.getDate() - n * 7);
      else if (unit === 'month') start.setMonth(start.getMonth() - n);
      return { after: start };
    }
    // "last week" / "this week" / "last month" / "this month"
    if (/\blast\s+week\b/.test(lower)) {
      const start = new Date(now); start.setDate(start.getDate() - 7);
      return { after: start };
    }
    if (/\bthis\s+week\b/.test(lower)) {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      return { after: start };
    }
    if (/\blast\s+month\b/.test(lower)) {
      const start = new Date(now); start.setMonth(start.getMonth() - 1);
      return { after: start };
    }
    if (/\bthis\s+month\b/.test(lower)) {
      const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0);
      return { after: start };
    }
    // "since YYYY-MM-DD"
    const since = lower.match(/since\s+(\d{4}-\d{2}-\d{2})/);
    if (since) {
      return { after: new Date(since[1] + 'T00:00:00Z') };
    }

    return null;
  }

  /**
   * Filter memories by time range using createdAt or updatedAt.
   */
  private filterByTime(memories: Memory[], filter: { after?: Date; before?: Date }): Memory[] {
    return memories.filter(m => {
      const dateStr = m.createdAt || m.updatedAt;
      if (!dateStr) return true; // include undated memories
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;
      if (filter.after && d < filter.after) return false;
      if (filter.before && d > filter.before) return false;
      return true;
    });
  }

  /**
   * Find relevant memories for a query.
   * Supports time-aware filtering ("last week", "since 2026-03-01", etc.)
   */
  findRelevantMemories(query: string, projectKeywords: string[] = []): Memory[] {
    if (!this.config.enabled || !query) return [];

    // Parse time filter from query (if present)
    const timeFilter = this.parseTimeFilter(query);

    // Determine which clusters to search
    const targetProjects = projectKeywords.length > 0 
      ? Array.from(this.clusters.keys()).filter(p =>
          projectKeywords.some(kw => p.includes(kw) || kw.includes(p))
        )
      : Array.from(this.clusters.keys());

    if (targetProjects.length === 0) {
      targetProjects.push(...Array.from(this.clusters.keys()));
    }

    let candidates: Memory[] = [];

    // Collect all candidate memories from target clusters
    targetProjects.forEach(project => {
      const cluster = this.clusters.get(project);
      if (!cluster) return;

      cluster.memories.forEach(memory => {
        if (memory.confidence >= this.config.minConfidence) {
          candidates.push(memory);
        }
      });
    });

    // Apply time filter if present
    if (timeFilter) {
      candidates = this.filterByTime(candidates, timeFilter);
    }

    // Score and rank
    const scored = candidates
      .map(memory => ({ ...memory, score: this.bm25Score(query, memory) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxMemories);

    return scored.map(({ score, ...memory }) => memory);
  }

  /**
   * Build compact summaries and select a minimal memory set before hydration.
   * Inspired by select-then-hydrate curation, but additive and default-off.
   */
  private curateMemoriesWithLibrarian(memories: Memory[], query: string): Memory[] {
    if (!this.config.contextLibrarianEnabled || memories.length <= 2) return memories;

    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const scored = memories.map((m, id) => {
      const summary = `${(m.type || 'fact')} ${(m.content || '').split('\n')[0]} ${(m.keywords || []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (summary.includes(t)) score += 1;
      }
      score += (m.confidence || 0) * 0.5;
      if (m.type === 'decision' || m.type === 'context') score += 0.35;
      return { id, memory: m, score };
    });

    const sortedByScore = [...scored].sort((a, b) => b.score - a.score);
    const selected = sortedByScore.slice(0, this.config.contextLibrarianMaxSelect).map(s => s.id);

    // Always include most recent N memories for coherence
    const recency = [...scored]
      .sort((a, b) => {
        const ta = new Date(a.memory.updatedAt || 0).getTime();
        const tb = new Date(b.memory.updatedAt || 0).getTime();
        return tb - ta;
      })
      .slice(0, this.config.contextLibrarianAlwaysIncludeRecent)
      .map(s => s.id);

    const keep = new Set([...selected, ...recency]);
    return memories.filter((_, idx) => keep.has(idx));
  }

  /**
   * Format memories for injection into prompt
   */
  formatMemories(memories: Memory[]): string {
    if (memories.length === 0) return '';

    const sections = {
      context: [] as string[],
      decision: [] as string[],
      fact: [] as string[],
      code: [] as string[],
    };

    memories.forEach(m => {
      const type = m.type as keyof typeof sections || 'fact';
      sections[type].push(m.content);
    });

    let output = '\n## 🧠 Relevant Context\n\n';

    if (sections.context.length > 0) {
      output += '### Context\n' + sections.context.map(c => `- ${c}`).join('\n') + '\n\n';
    }

    if (sections.decision.length > 0) {
      output += '### Key Decisions\n' + sections.decision.map(d => `- ${d}`).join('\n') + '\n\n';
    }

    if (sections.fact.length > 0) {
      output += '### Facts\n' + sections.fact.map(f => `- ${f}`).join('\n') + '\n\n';
    }

    if (sections.code.length > 0) {
      output += '### Code Reference\n' + sections.code.join('\n') + '\n\n';
    }

    return output;
  }

  /**
   * Estimate tokens (rough: 4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Inject memories into system prompt or context
   */
  injectMemories(
    systemPrompt: string,
    query: string,
    projectKeywords: string[] = []
  ): { prompt: string; injected: number; tokens: number } {
    if (this.config.injectMode === 'off') {
      return { prompt: systemPrompt, injected: 0, tokens: 0 };
    }

    const memories = this.findRelevantMemories(query, projectKeywords);
    if (memories.length === 0) {
      return { prompt: systemPrompt, injected: 0, tokens: 0 };
    }

    const curated = this.curateMemoriesWithLibrarian(memories, query);
    const formatted = this.formatMemories(curated);
    const injectedTokens = this.estimateTokens(formatted);

    // Respect token budget
    if (injectedTokens > this.config.tokenBudget) {
      console.warn(`[ClawText RAG] Injection would exceed budget: ${injectedTokens} > ${this.config.tokenBudget}`);
      return { prompt: systemPrompt, injected: 0, tokens: 0 };
    }

    // Inject based on mode
    let injectedPrompt = systemPrompt;
    if (this.config.injectMode === 'smart' || this.config.injectMode === 'full') {
      injectedPrompt = systemPrompt + formatted;
    } else if (this.config.injectMode === 'snippets') {
      // Just inject memory titles/summaries for efficiency
      const snippets = memories
        .map(m => `- [${m.type}] ${m.content.split('\n')[0].substring(0, 100)}...`)
        .join('\n');
      injectedPrompt = systemPrompt + '\n## Context Snippets\n' + snippets + '\n';
    }

    return {
      prompt: injectedPrompt,
      injected: curated.length,
      tokens: injectedTokens,
    };
  }

  /**
   * Update config at runtime
   */
  setConfig(partial: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Get current stats
   */
  getStats() {
    let totalMemories = 0;
    this.clusters.forEach(c => {
      totalMemories += c.memories.length;
    });

    return {
      clustersLoaded: this.clusters.size,
      totalMemories,
      config: this.config,
    };
  }
}

// Export for use in plugins/skills
export default ClawTextRAG;
