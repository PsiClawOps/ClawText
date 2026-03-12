import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Memory {
  content: string;
  type: string;
  source: string;
  project: string;
  confidence: number;
  keywords: string[];
  updatedAt: string;
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

    console.log(`[ClawText RAG] Loaded ${this.clusters.size} clusters`);
  }

  /**
   * Search memories by keywords using BM25-style scoring
   */
  private bm25Score(query: string, memory: Memory): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const memoryText = (memory.content + ' ' + memory.keywords.join(' ')).toLowerCase();

    let score = 0;
    queryTerms.forEach(term => {
      if (memoryText.includes(term)) {
        score += 1;
      }
    });

    // Boost by confidence
    score *= memory.confidence;

    return score;
  }

  /**
   * Find relevant memories for a query
   */
  findRelevantMemories(query: string, projectKeywords: string[] = []): Memory[] {
    if (!this.config.enabled || !query) return [];

    // Determine which clusters to search
    const targetProjects = projectKeywords.length > 0 
      ? Array.from(this.clusters.keys()).filter(p =>
          projectKeywords.some(kw => p.includes(kw) || kw.includes(p))
        )
      : Array.from(this.clusters.keys());

    if (targetProjects.length === 0) {
      targetProjects.push(...Array.from(this.clusters.keys()));
    }

    const allMemories: Array<Memory & { score: number }> = [];

    // Search across target clusters
    targetProjects.forEach(project => {
      const cluster = this.clusters.get(project);
      if (!cluster) return;

      cluster.memories.forEach(memory => {
        if (memory.confidence >= this.config.minConfidence) {
          const score = this.bm25Score(query, memory);
          if (score > 0) {
            allMemories.push({ ...memory, score });
          }
        }
      });
    });

    // Sort by score and truncate
    return allMemories
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxMemories)
      .map(({ score, ...memory }) => memory);
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
