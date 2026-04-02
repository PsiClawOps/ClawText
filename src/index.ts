import fs from 'fs';
import os from 'os';
import path from 'path';
import { ClawTextInjectionPlugin } from './plugin';
import { ClawTextRAG } from './rag';
import { Clawptimizer, DEFAULT_CLAWPTIMIZATION_CONFIG } from './clawptimization';
import type { ClawptimizationConfig, ContextSlotSource } from './clawptimization';
import { PromptCompositor } from './prompt-compositor';
import type { SlotProvider, ContextSlot } from './slot-provider';
import { TopicAnchorProvider } from './providers/topic-anchor-provider';
import { AdvisorProvider } from './providers/advisor-provider';
import { SessionMatrixProvider } from './providers/session-matrix-provider';
import { ExtractionProvider } from './providers/extraction-provider';
import { stripInjectedContext } from './injected-context';
import { isMultiAgentMode } from './agent-identity';
import { extractIdentityAnchorContent } from './slots/identity-anchor-provider';
import { wrapWithAgentScope } from './providers/agent-scoped-provider';
import { Type } from '@sinclair/typebox';
import { registerSessionIntelligenceEngine, getRegisteredSIEngine } from './session-intelligence';
import type { SessionIntelligenceConfig } from './session-intelligence';

export { ClawTextInjectionPlugin, ClawTextRAG };
export { cleanQueryForSearch } from './rag';
export * from './library';
export * from './library-index';
export * from './library-ingest';
export * from './agent-identity';
export * from './decoherence';
export * from './council-bus';
export * from './providers/agent-scoped-provider';
export * from './runtime-paths';
export * from './session-topic-map';
export * from './topic-anchor';
export * from './injected-context';
export * from './clawptimization';
export * from './slot-provider';
export * from './budget-manager';
export * from './context-pressure';
export * from './active-pruning';
export * from './prompt-compositor';
export * from './decision-tree';
export * from './providers/decision-tree-provider';
export * from './content-type-classifier';
export * from './contradiction-detector';
export * from './providers/index';
export * from './providers/cross-session-provider';
export * from './providers/situational-awareness-provider';
export * from './providers/clawbridge-provider';
export * from './slots/index';
export * from './slots/advisor';
export * from './slots/sessionMatrix';
export * from './integrations/index';
export * from './permissions/index';
export * from './record/index';
export * from './fleet/index';
export * from './peer/index';
export * from './extraction/index';
export * from './session-intelligence';

// Default workspace — used for paths that don't have a per-session context (logs, config)
const DEFAULT_WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const OPT_CONFIG_PATH = path.join(DEFAULT_WORKSPACE, 'state', 'clawtext', 'prod', 'optimize-config.json');
const OPT_LOG_PATH = path.join(DEFAULT_WORKSPACE, 'state', 'clawtext', 'prod', 'optimization-log.jsonl');

/**
 * Resolve workspace for the active session/agent.
 *
 * Resolution order:
 * 1) Explicit ctx.agentId (preferred)
 * 2) Agent ID derived from session key (legacy fallback)
 * 3) DEFAULT_WORKSPACE
 */
function resolveWorkspaceForSession(
  sessionKey: string | undefined,
  agentId: string | undefined,
  api?: {
    runtime?: {
      agent?: {
        resolveAgentWorkspaceDir?: (cfg: unknown, agentId: string) => string | undefined;
        resolveAgentIdFromSessionKey?: (sessionKey: string) => string;
      };
    };
  },
  cfg?: unknown,
): { workspacePath: string; source: 'agentId' | 'sessionKey' | 'default' } {
  try {
    const agentRuntime = api?.runtime?.agent;
    if (agentRuntime && typeof agentRuntime.resolveAgentWorkspaceDir === 'function') {
      if (agentId) {
        const fromAgentId = agentRuntime.resolveAgentWorkspaceDir(cfg, agentId);
        if (fromAgentId) return { workspacePath: fromAgentId, source: 'agentId' };
      }

      if (sessionKey && typeof agentRuntime.resolveAgentIdFromSessionKey === 'function') {
        const resolvedAgentId = agentRuntime.resolveAgentIdFromSessionKey(sessionKey);
        if (resolvedAgentId) {
          const fromSessionKey = agentRuntime.resolveAgentWorkspaceDir(cfg, resolvedAgentId);
          if (fromSessionKey) return { workspacePath: fromSessionKey, source: 'sessionKey' };
        }
      }
    }
  } catch {
    // fall through to default
  }
  return { workspacePath: DEFAULT_WORKSPACE, source: 'default' };
}

function logPluginDiagnostic(entry: Record<string, unknown>): void {
  try {
    const dir = path.dirname(OPT_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFile(OPT_LOG_PATH, JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), source: 'plugin-register', ...entry }) + '\n', () => {});
  } catch {
    // fire-and-forget
  }
}

function loadOptimizeConfig(): ClawptimizationConfig {
  try {
    if (!fs.existsSync(OPT_CONFIG_PATH)) return { ...DEFAULT_CLAWPTIMIZATION_CONFIG };
    const parsed = JSON.parse(fs.readFileSync(OPT_CONFIG_PATH, 'utf8'));
    return {
      ...DEFAULT_CLAWPTIMIZATION_CONFIG,
      ...parsed,
      budget: { ...DEFAULT_CLAWPTIMIZATION_CONFIG.budget, ...(parsed.budget ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CLAWPTIMIZATION_CONFIG };
  }
}

function inferSource(title: string, content: string): ContextSlotSource {
  const haystack = `${title}\n${content}`.toLowerCase();
  if (haystack.includes('journal') || haystack.includes('restored context')) return 'journal';
  if (haystack.includes('memory') || haystack.includes('memories')) return 'memory';
  if (haystack.includes('clawbridge') || haystack.includes('handoff')) return 'clawbridge';
  if (haystack.includes('topic anchor') || haystack.includes('topic_anchor')) return 'topic-anchor';
  if (haystack.includes('library') || haystack.includes('reference')) return 'library';
  if (haystack.includes('decision')) return 'decision-tree';
  if (haystack.includes('deep history')) return 'deep-history';
  if (haystack.includes('mid history')) return 'mid-history';
  if (haystack.includes('history')) return 'recent-history';
  return 'system';
}

function parsePromptSections(prompt: string): Array<{ title: string; content: string; source: ContextSlotSource }> {
  const lines = prompt.split(/\r?\n/);
  const sections: Array<{ title: string; content: string; source: ContextSlotSource }> = [];
  let currentTitle = 'Prelude';
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (!content) return;
    sections.push({ title: currentTitle, content, source: inferSource(currentTitle, content) });
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      currentTitle = line.replace(/^##\s+/, '').trim() || 'Untitled';
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  if (sections.length === 0 && prompt.trim()) {
    return [{ title: 'Prompt', content: prompt.trim(), source: inferSource('Prompt', prompt) }];
  }
  return sections;
}

function priorityForSource(source: ContextSlotSource): number {
  const ordering: Record<string, number> = {
    system: 10,
    'operator-recall-anchor': 15,
    'identity-anchor': 16,
    'retrieval-warning': 18,
    memory: 20,
    'topic-anchor': 25,
    advisor: 28,
    'session-matrix': 29,
    library: 30,
    clawbridge: 40,
    'recent-history': 50,
    'mid-history': 60,
    'deep-history': 70,
    'decision-tree': 80,
    journal: 90,
    'cross-session': 100,
    'situational-awareness': 110,
    custom: 120,
  };
  return ordering[source] ?? 999;
}

function extractOperatorRecallAnchor(userMessage: string): string | null {
  const text = userMessage.trim();
  if (!text) return null;

  const signals: string[] = [];
  const lowered = text.toLowerCase();

  const phraseChecks: Array<[RegExp, string]> = [
    [/\byou forgot\b/i, 'explicit continuity complaint: "you forgot"'],
    [/\bwe talked about\b/i, 'explicit continuity cue: "we talked about"'],
    [/\bearlier in the thread\b/i, 'explicit thread continuity cue'],
    [/\bin the thread we were posting in\b/i, 'explicit thread reference'],
    [/\bit talked about\b/i, 'explicit prior-content pointer'],
    [/\bwe went over this\b/i, 'explicit prior discussion pointer'],
  ];

  for (const [pattern, label] of phraseChecks) {
    if (pattern.test(text)) signals.push(label);
  }

  const snowflakes = [...text.matchAll(/\b\d{17,20}\b/g)].map((m) => m[0]);
  if (snowflakes.length > 0) {
    signals.push(`referenced message/thread IDs: ${snowflakes.slice(0, 3).join(', ')}`);
  }

  const inlineCode = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
  if (inlineCode.length > 0) {
    signals.push(`inline technical anchors: ${inlineCode.slice(0, 4).join(', ')}`);
  }

  const pathMatches = [...text.matchAll(/(?:\/[-\w./]+|[-\w.]+\.(?:conf|json|yaml|yml|md|ts|js))/g)]
    .map((m) => m[0])
    .filter(Boolean);
  if (pathMatches.length > 0) {
    signals.push(`path/config anchors: ${pathMatches.slice(0, 4).join(', ')}`);
  }

  const keywordAnchors = ['dfree', 'samba', 'time machine', 'mount failed', 'fruit:time machine'];
  const matchedKeywords = keywordAnchors.filter((term) => lowered.includes(term));
  if (matchedKeywords.length > 0) {
    signals.push(`keyword anchors: ${matchedKeywords.join(', ')}`);
  }

  if (signals.length === 0) return null;

  return [
    '## Operator Recall Anchor',
    ...signals.map((line) => `- ${line}`),
    `- user cue: ${text}`,
  ].join('\n');
}

function extractRetrievalWarning(userMessage: string): string | null {
  const text = userMessage.trim();
  if (!text) return null;

  const lowered = text.toLowerCase();
  const complaintPatterns = [
    /memory[_\s-]*search.*(?:empty|nothing|blank|fail|failed)/i,
    /search.*(?:empty|nothing|blank).*(?:memory|context)/i,
    /major memory gap/i,
    /couldn'?t find recent conversation context/i,
    /memory (?:was|is) returning empty/i,
    /context retention.*(?:broken|missing|empty)/i,
    /fetch failed/i,
    /sync failed/i,
  ];

  const matched = complaintPatterns.some((pattern) => pattern.test(text));
  if (!matched) return null;

  return [
    '## Retrieval Warning',
    '- Suspected false-empty memory retrieval.',
    '- Named pattern: recovery-pattern.gateway.memory-false-empty-on-sync-failure',
    '- Do not assume missing memory content just because retrieval looks empty.',
    '- First response sequence:',
    '  1. run `openclaw status`',
    '  2. verify runtime version is not behind config expectations',
    '  3. run a direct search smoke test',
    '  4. inspect for `memory sync failed` / `fetch failed`',
    '  5. restart gateway/runtime before blaming files or index',
    `- user cue: ${text}`,
  ].join('\n');
}

function runClawptimization(
  prompt: string,
  messages: unknown[],
  channelId: string,
  sessionKey: string,
  agentId: string | undefined,
  api?: unknown,
  cfg?: unknown,
): { prependContext?: string } | undefined {
  const config = loadOptimizeConfig();
  const resolvedWorkspace = resolveWorkspaceForSession(
    sessionKey,
    agentId,
    api as Parameters<typeof resolveWorkspaceForSession>[2],
    cfg,
  );
  const WORKSPACE = resolvedWorkspace.workspacePath;

  logPluginDiagnostic({
    type: 'workspace-resolve',
    channel: channelId,
    sessionKey,
    agentId: agentId ?? null,
    workspacePath: WORKSPACE,
    source: resolvedWorkspace.source,
  });

  if (!config.enabled || config.strategy === 'passthrough') {
    logPluginDiagnostic({ type: 'skip', reason: !config.enabled ? 'disabled' : 'passthrough', channel: channelId });
    return undefined;
  }

  if (!prompt.trim()) {
    logPluginDiagnostic({ type: 'skip', reason: 'empty-prompt', channel: channelId });
    return undefined;
  }

  // Strip prior injected context before scoring to avoid recursive re-ingestion.
  const promptForComposition = stripInjectedContext(prompt);

  const parsed = parsePromptSections(promptForComposition);
  if (parsed.length === 0) {
    logPluginDiagnostic({ type: 'skip', reason: 'no-sections', channel: channelId, promptLength: prompt.length });
    return undefined;
  }

  const optimizer = new Clawptimizer(WORKSPACE, config);
  const compositor = new PromptCompositor({
    enabled: config.enabled,
    strategy: config.strategy,
    minScore: config.minScore,
    preserveReasons: config.preserveReasons,
    logDecisions: false,
    workspacePath: WORKSPACE,
    budget: {
      contextWindowTokens: config.budget?.contextWindowTokens ?? 160_000,
      budgetRatio: config.budget?.budgetRatio,
      slots: config.budget?.slots,
      overflowMode: config.budget?.overflowMode,
    },
  });

  compositor.register(wrapWithAgentScope(new TopicAnchorProvider({ workspacePath: WORKSPACE }), WORKSPACE));
  compositor.register(wrapWithAgentScope(new AdvisorProvider({ workspacePath: WORKSPACE }), WORKSPACE));
  compositor.register(wrapWithAgentScope(new SessionMatrixProvider({ workspacePath: WORKSPACE }), WORKSPACE));
  compositor.register(wrapWithAgentScope(new ExtractionProvider({ workspacePath: WORKSPACE }), WORKSPACE));

  // Identity anchor — always-on in multi-agent mode, no-op in single-agent
  if (isMultiAgentMode(WORKSPACE)) {
    const identityContent = extractIdentityAnchorContent(WORKSPACE);
    if (identityContent) {
      const idBytes = Buffer.byteLength(identityContent, 'utf8');
      const identityProvider: SlotProvider = {
        id: 'identity-anchor',
        source: 'identity-anchor',
        priority: priorityForSource('identity-anchor'),
        available: () => true,
        fill: () => [{
          id: 'Identity Anchor',
          source: 'identity-anchor',
          content: identityContent,
          score: 1,
          bytes: idBytes,
          included: false,
          reason: 'agent identity reinforcement',
        }],
        prunable: false,
      };
      compositor.register(identityProvider);
    }
  }

  const userMessage = extractUserText(messages);
  const recallAnchor = extractOperatorRecallAnchor(userMessage);
  if (recallAnchor) {
    const anchorBytes = Buffer.byteLength(recallAnchor, 'utf8');
    const recallProvider: SlotProvider = {
      id: 'operator-recall-anchor',
      source: 'operator-recall-anchor',
      priority: priorityForSource('operator-recall-anchor'),
      available: () => true,
      fill: () => [{
        id: 'Operator Recall Anchor',
        source: 'operator-recall-anchor',
        content: recallAnchor,
        score: 1,
        bytes: anchorBytes,
        included: false,
        reason: 'explicit user continuity cue',
      }],
      prunable: false,
    };
    compositor.register(recallProvider);
  }

  const retrievalWarning = extractRetrievalWarning(userMessage);
  if (retrievalWarning) {
    const warningBytes = Buffer.byteLength(retrievalWarning, 'utf8');
    const warningProvider: SlotProvider = {
      id: 'retrieval-warning',
      source: 'retrieval-warning',
      priority: priorityForSource('retrieval-warning'),
      available: () => true,
      fill: () => [{
        id: 'Retrieval Warning',
        source: 'retrieval-warning',
        content: retrievalWarning,
        score: 1,
        bytes: warningBytes,
        included: false,
        reason: 'suspected false-empty memory retrieval',
      }],
      prunable: false,
    };
    compositor.register(warningProvider);
  }

  const bySource = new Map<ContextSlotSource, Array<{ title: string; content: string; source: ContextSlotSource }>>();
  for (const section of parsed) {
    const list = bySource.get(section.source) ?? [];
    list.push(section);
    bySource.set(section.source, list);
  }

  for (const [source, sections] of bySource.entries()) {
    const provider: SlotProvider = {
      id: `parsed:${source}`,
      source,
      priority: priorityForSource(source),
      available: () => sections.length > 0,
      fill: () => sections.map((section, index) => {
        const bytes = Buffer.byteLength(section.content, 'utf8');
        const ageMs = index * 60 * 1000;
        const score = optimizer.scoreContent(section.content, {
          source, ageMs,
          isRawLog: /```|stack trace|error:|\{.+\}/is.test(section.content),
          precedingGapMs: index > 0 ? 5 * 60 * 1000 : 0,
        });
        const freshness = Math.max(0, Math.min(1, 1 - ageMs / (12 * 60 * 60 * 1000)));
        const substance = Math.min(1, section.content.split(/\s+/).filter(Boolean).length / 80);
        const novelty = index === 0 ? 1 : 0.8;
        return {
          id: section.title || `${source}-${index + 1}`,
          source,
          content: section.content,
          score,
          bytes,
          included: false,
          reason: `freshness:${freshness.toFixed(2)} substance:${substance.toFixed(2)} novelty:${novelty.toFixed(2)}`,
        } as ContextSlot;
      }),
      prunable: source !== 'system' && source !== 'recent-history',
    };
    compositor.register(provider);
  }

  const result = compositor.compose({
    channelId,
    sessionKey,
    modelContextWindowTokens: config.budget?.contextWindowTokens ?? 160_000,
    currentTurnCount: Array.isArray(messages) ? messages.length : 0,
  });

  const included = result.slots.filter((slot: ContextSlot) => slot.included);
  if (included.length === 0) {
    logPluginDiagnostic({
      type: 'empty-result', channel: channelId,
      sectionCount: parsed.length, slotCount: result.slots.length,
      droppedCount: result.droppedCount, totalBytes: result.totalBytes,
    });
    return undefined;
  }

  const blocks = included.map((slot: ContextSlot) => `## ${slot.id}\n${slot.content}`);
  const prependContext = ['<!-- CLAWPTIMIZATION: optimized context -->', ...blocks, '<!-- END CLAWPTIMIZATION -->'].join('\n\n');

  if (config.logDecisions) {
    optimizer.logDecision(result, sessionKey);
  }

  logPluginDiagnostic({
    type: 'composed', channel: channelId, strategy: result.strategy,
    includedCount: result.includedCount, droppedCount: result.droppedCount,
    totalBytes: result.totalBytes, budgetBytes: result.budgetBytes,
    prependBytes: Buffer.byteLength(prependContext, 'utf8'),
  });

  return { prependContext };
}

function extractUserText(messages: unknown[] = []): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  const contentFromMessage = (msg: unknown): string => {
    if (!msg || typeof msg !== "object") {
      return String(msg ?? "");
    }

    const record = msg as {
      content?: unknown;
      contentPreview?: unknown;
      text?: unknown;
      prompt?: unknown;
      message?: unknown;
    };

    return (
      (typeof record.content === "string" ? record.content : "") ||
      (typeof record.contentPreview === "string" ? record.contentPreview : "") ||
      (typeof record.text === "string" ? record.text : "") ||
      (typeof record.prompt === "string" ? record.prompt : "") ||
      (typeof record.message === "string" ? record.message : "") ||
      ""
    );
  };

  const lastMessage = messages[messages.length - 1];
  return contentFromMessage(lastMessage);
}

function hasDelimitedToken(value: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[\\s:_./-])${escaped}(?:$|[\\s:_./-])`, 'i');
  return pattern.test(value);
}

function getAutomationSkipReason(ctx: any, userMessage: string): string | null {
  const trigger = typeof ctx?.trigger === 'string' ? ctx.trigger.trim().toLowerCase() : '';
  if (trigger) {
    if (trigger.includes('heartbeat')) return 'trigger-heartbeat';
    if (hasDelimitedToken(trigger, 'cron')) return 'trigger-cron';
    if (/memory[\s:_-]*internal/i.test(trigger)) return 'trigger-memory-internal';
  }

  const identityFields = [ctx?.sessionKey, ctx?.sessionId, ctx?.agentId, ctx?.messageChannel]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const field of identityFields) {
    const normalized = field.trim().toLowerCase();
    if (normalized.includes('heartbeat')) return 'session-heartbeat';
    if (hasDelimitedToken(normalized, 'cron')) return 'session-cron';
    if (/memory[\s:_-]*internal/i.test(normalized)) return 'session-memory-internal';
  }

  const normalizedMessage = userMessage.trim().toLowerCase();
  if (normalizedMessage.startsWith('read heartbeat.md if it exists')) return 'message-heartbeat-poll';

  return null;
}

function isSessionIntelligenceEnabled(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false;

  const root = config as {
    plugins?: {
      entries?: {
        clawtext?: {
          config?: {
            sessionIntelligence?: {
              enabled?: unknown;
            };
          };
        };
      };
    };
  };

  return root.plugins?.entries?.clawtext?.config?.sessionIntelligence?.enabled === true;
}

function resolveSessionIntelligenceConfig(config: unknown): SessionIntelligenceConfig {
  const summarizationApi: NonNullable<SessionIntelligenceConfig['summarizationApi']> = {
    async complete(_model: string, prompt: string): Promise<string> {
      // Uses copilot-local proxy (GitHub Copilot backend) — gemini-3-flash-preview with thinking disabled.
      // thinking disabled is intentional: reasoning budget on a background summarization task is wasteful.
      const response = await fetch('http://127.0.0.1:4141/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemini-3-flash-preview',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
          temperature: 0.3,
          thinking: { type: 'disabled' },
        }),
      });

      if (!response.ok) throw new Error(`[SI] Summarization error: ${response.status}`);

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('[SI] Empty summarization response');
      return content.trim();
    },
  };

  const base: SessionIntelligenceConfig = {
    workspacePath: DEFAULT_WORKSPACE,
    defaultTokenBudget: 128_000,
    summarizationApi,
    compactor: {
      summarizationModel: 'anthropic/claude-haiku-4-5',
      maxSummarizationsPerHour: 10,
      freshTailSize: 20,
      leafBatchSize: 30,
    },
  };

  if (!config || typeof config !== 'object') return base;

  const root = config as {
    plugins?: {
      entries?: {
        clawtext?: {
          config?: {
            sessionIntelligence?: {
              workspacePath?: unknown;
              summarizationModel?: unknown;
              defaultTokenBudget?: unknown;
              compactor?: {
                summarizationModel?: unknown;
                maxSummarizationsPerHour?: unknown;
                freshTailSize?: unknown;
                leafBatchSize?: unknown;
              };
            };
          };
        };
      };
    };
  };

  const si = root.plugins?.entries?.clawtext?.config?.sessionIntelligence;
  if (!si) return base;

  const configuredCompactor = si.compactor;

  return {
    workspacePath: typeof si.workspacePath === 'string' && si.workspacePath.trim().length > 0
      ? si.workspacePath
      : base.workspacePath,
    defaultTokenBudget: typeof si.defaultTokenBudget === 'number' && Number.isFinite(si.defaultTokenBudget) && si.defaultTokenBudget > 0
      ? si.defaultTokenBudget
      : base.defaultTokenBudget,
    summarizationApi,
    compactor: {
      summarizationModel: typeof configuredCompactor?.summarizationModel === 'string' && configuredCompactor.summarizationModel.trim().length > 0
        ? configuredCompactor.summarizationModel
        : typeof si.summarizationModel === 'string' && si.summarizationModel.trim().length > 0
          ? si.summarizationModel
          : base.compactor?.summarizationModel,
      maxSummarizationsPerHour:
        typeof configuredCompactor?.maxSummarizationsPerHour === 'number'
          && Number.isFinite(configuredCompactor.maxSummarizationsPerHour)
          && configuredCompactor.maxSummarizationsPerHour > 0
          ? configuredCompactor.maxSummarizationsPerHour
          : base.compactor?.maxSummarizationsPerHour,
      freshTailSize:
        typeof configuredCompactor?.freshTailSize === 'number'
          && Number.isFinite(configuredCompactor.freshTailSize)
          && configuredCompactor.freshTailSize >= 0
          ? configuredCompactor.freshTailSize
          : base.compactor?.freshTailSize,
      leafBatchSize:
        typeof configuredCompactor?.leafBatchSize === 'number'
          && Number.isFinite(configuredCompactor.leafBatchSize)
          && configuredCompactor.leafBatchSize > 0
          ? configuredCompactor.leafBatchSize
          : base.compactor?.leafBatchSize,
    },
  };
}

export default {
  id: "clawtext",
  name: "ClawText",
  description:
    "Automatic working-memory retrieval, prompt injection, and operational learning hooks for OpenClaw.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sessionIntelligence: {
        type: "object",
        additionalProperties: true,
        properties: {
          enabled: { type: "boolean" },
          workspacePath: { type: "string" },
          defaultTokenBudget: { type: "number" },
          summarizationModel: { type: "string" },
          compactor: {
            type: "object",
            additionalProperties: true,
            properties: {
              summarizationModel: { type: "string" },
              maxSummarizationsPerHour: { type: "number" },
              freshTailSize: { type: "number" },
              leafBatchSize: { type: "number" },
            },
          },
          compactionTrigger: {
            type: "object",
            additionalProperties: true,
            properties: {
              pressureThreshold: { type: "number" },
              minMessages: { type: "number" },
              cooldownMs: { type: "number" },
            },
          },
        },
      },
    },
  },
  register(api: any) {
    if (isSessionIntelligenceEnabled(api?.config)) {
      try {
        const workspaceResolver = (sessionId: string): string => {
          try {
            // Primary path: runtime passes session keys like agent:<agentId>:...
            if (typeof sessionId === 'string' && sessionId.startsWith('agent:')) {
              const parts = sessionId.split(':');
              if (parts[0] === 'agent' && parts[1]) {
                const resolved = resolveWorkspaceForSession(sessionId, parts[1], api as any);
                return resolved.workspacePath;
              }
            }

            // Fallback: older/runtime-internal callers may pass the opaque session UUID.
            const stateFile = path.join(DEFAULT_WORKSPACE, 'state', 'clawtext', 'runtime', 'agent-session-state.json');
            if (fs.existsSync(stateFile)) {
              const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
              const sessions = state?.sessionsByKey ?? {};
              for (const [key, val] of Object.entries(sessions)) {
                if ((val as any)?.sessionId === sessionId) {
                  const parts = key.split(':');
                  if (parts[0] === 'agent' && parts[1]) {
                    const agentId = parts[1];
                    const resolved = resolveWorkspaceForSession(key, agentId, api as any);
                    return resolved.workspacePath;
                  }
                }
              }
            }
          } catch {
            // ignore
          }
          return DEFAULT_WORKSPACE;
        };

        const siConfig = resolveSessionIntelligenceConfig(api?.config);
        siConfig.workspaceResolver = workspaceResolver;
        registerSessionIntelligenceEngine(api, siConfig);

        // Register SI recall tools
        api.registerTool((ctx: any): any => {
          const engine = getRegisteredSIEngine() as any;
          if (!engine?._recall) return null;
          return {
            name: 'si_search',
            description: 'Search session history for messages, summaries, state slots, and library entries matching a query. Returns ranked hits with snippets. Use to find prior context beyond the current window.',
            parameters: Type.Object({
              query: Type.String({ description: 'Keyword or phrase to search for' }),
              limit: Type.Optional(Type.Number({ description: 'Max results (default 10)' })),
              types: Type.Optional(Type.Array(
                Type.Union([
                  Type.Literal('message'),
                  Type.Literal('summary'),
                  Type.Literal('state_slot'),
                  Type.Literal('library_entry'),
                ]),
                { description: 'Filter by result type' },
              )),
            }),
            execute: async (_toolCallId: string, params: any) => {
              const sessionId = ctx.sessionId ?? ctx.sessionKey ?? 'default';
              const result = engine._recall.search(sessionId, params.query, params.limit, params.types);
              return { result };
            },
          };
        });

        api.registerTool((ctx: any): any => {
          const engine = getRegisteredSIEngine() as any;
          if (!engine?._recall) return null;
          return {
            name: 'si_describe',
            description: 'Get the full content of a specific session history item by its id (from si_search hits). Use to read the complete text of a message, summary, state slot, or library entry.',
            parameters: Type.Object({
              id: Type.String({ description: 'Item id from a prior si_search result (e.g. msg-42, sum-7, slot-identity_kernel, lib-myfile.md)' }),
            }),
            execute: async (_toolCallId: string, params: any) => {
              const sessionId = ctx.sessionId ?? ctx.sessionKey ?? 'default';
              const result = engine._recall.describe(sessionId, params.id);
              return { result };
            },
          };
        });

        api.registerTool((ctx: any): any => {
          const engine = getRegisteredSIEngine() as any;
          if (!engine?._recall) return null;
          return {
            name: 'si_expand',
            description: 'Expand a summary node or payload reference to recover the original messages or file content. Use when si_search returns a summary or payload ref and you need the underlying detail.',
            parameters: Type.Object({
              target_id: Type.String({ description: 'Summary id (e.g. sum-7) or payload ref id to expand' }),
            }),
            execute: async (_toolCallId: string, params: any) => {
              const sessionId = ctx.sessionId ?? ctx.sessionKey ?? 'default';
              const result = engine._recall.expand(sessionId, params.target_id);
              return { result };
            },
          };
        });
      } catch (err) {
        logPluginDiagnostic({
          type: 'session-intelligence-register-error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const plugin = new ClawTextInjectionPlugin();

    api.on(
      "before_prompt_build",
      async (event: { prompt?: unknown; messages?: unknown[] }, ctx?: any) => {
        const systemPrompt = typeof event.prompt === "string" ? event.prompt : "";
        const messages = Array.isArray(event.messages) ? event.messages : [];
        const userMessage = extractUserText(messages);

        const skipReason = getAutomationSkipReason(ctx, userMessage);
        if (skipReason) {
          logPluginDiagnostic({
            type: 'skip-automation-session',
            reason: skipReason,
            trigger: ctx?.trigger,
            channel: ctx?.messageChannel || 'unknown',
          });
          return undefined;
        }

        // Step 1: RAG-based memory injection (existing behavior)
        const ragResult = await plugin.onBeforePromptBuild({
          systemPrompt,
          userMessage,
          agentId: ctx?.agentId,
        });

        const promptAfterRag = ragResult?.systemPrompt || systemPrompt;

        // Step 2: Clawptimization compositor (scores, budgets, prunes)
        try {
          const channelId = ctx?.messageChannel || 'unknown';
          const sessionKey = ctx?.sessionKey || ctx?.sessionId || `session-${Date.now()}`;

          const optimizeResult = runClawptimization(
            promptAfterRag,
            messages,
            channelId,
            sessionKey,
            ctx?.agentId,
            api,
            api.config,
          );

          if (optimizeResult?.prependContext) {
            return {
              systemPrompt: ragResult?.systemPrompt !== systemPrompt ? ragResult.systemPrompt : undefined,
              prependContext: optimizeResult.prependContext,
            };
          }
        } catch (err) {
          logPluginDiagnostic({ type: 'plugin-error', error: err instanceof Error ? err.message : String(err), channel: ctx?.messageChannel });
          // Fall through to RAG-only result
        }

        // If Clawptimization didn't produce anything, return RAG result only
        return ragResult?.systemPrompt ? { systemPrompt: ragResult.systemPrompt } : undefined;
      },
      { priority: 40 },
    );
  },
};

