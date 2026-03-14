import fs from 'fs';
import path from 'path';
import ClawTextRAG from './rag.js';

/**
 * Plugin hook for automatic context injection
 * Fires on before_prompt_build to inject relevant memories
 *
 * Project keywords are auto-detected from cluster filenames — no hardcoding.
 */
export class ClawTextInjectionPlugin {
  private rag: ClawTextRAG;

  constructor() {
    this.rag = new ClawTextRAG();
  }

  /**
   * Auto-detect available project IDs from cluster filenames.
   * Returns project names derived from cluster-<project>.json files.
   */
  private getAvailableProjects(): string[] {
    const clustersDir = path.join(
      process.env.HOME || '',
      '.openclaw/workspace/memory/clusters'
    );
    try {
      return fs
        .readdirSync(clustersDir)
        .filter(f => f.startsWith('cluster-') && f.endsWith('.json'))
        .map(f => f.replace('cluster-', '').replace('.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * Match project IDs that appear in the given text.
   * Uses cluster-derived project names as the keyword set.
   */
  private detectProjectKeywords(text: string): string[] {
    const lower = text.toLowerCase();
    return this.getAvailableProjects().filter(project =>
      lower.includes(project.toLowerCase())
    );
  }

  /**
   * Hook: before_prompt_build
   * Called before each prompt is built, allows modification of system prompt
   */
  async onBeforePromptBuild(context: {
    systemPrompt: string;
    userMessage: string;
    sessionId?: string;
    model?: string;
  }): Promise<{ systemPrompt: string; injectionStats?: any }> {
    try {
      // Auto-detect projects from message + system prompt
      const combinedText = context.userMessage + ' ' + context.systemPrompt;
      const projectKeywords = this.detectProjectKeywords(combinedText);

      // Inject memories
      const { prompt, injected, tokens } = this.rag.injectMemories(
        context.systemPrompt,
        context.userMessage,
        projectKeywords
      );

      if (injected > 0) {
        console.log(
          `[ClawText] Injected ${injected} memories (${tokens} tokens) for session ${context.sessionId}`
        );
      }

      return {
        systemPrompt: prompt,
        injectionStats: {
          memoriesInjected: injected,
          tokensAdded: tokens,
          projectKeywords,
        },
      };
    } catch (error) {
      console.error('[ClawText] Injection failed:', error);
      return { systemPrompt: context.systemPrompt };
    }
  }

  /**
   * Get RAG stats (for monitoring)
   */
  getStats() {
    return this.rag.getStats();
  }

  /**
   * Reload clusters (for hot updates)
   */
  reload() {
    this.rag = new ClawTextRAG();
    return this.getStats();
  }
}

export default ClawTextInjectionPlugin;
