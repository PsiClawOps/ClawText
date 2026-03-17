import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  BudgetManager,
  type BudgetManagerConfig,
  type SlotBudgetAllocation,
} from './budget-manager.js';
import { ContextPressureMonitor, type ContextPressure } from './context-pressure.js';
import type { ContextSlot, ContextSlotSource, SlotContext, SlotProvider } from './slot-provider.js';

export type CompositionStrategy = 'scored-select' | 'passthrough' | 'budget-trim';

export interface PromptCompositorConfig {
  enabled?: boolean;
  strategy?: CompositionStrategy;
  minScore?: number;
  preserveReasons?: boolean;
  logDecisions?: boolean;
  workspacePath?: string;
  budget?: BudgetManagerConfig;
  pressureStateFilePath?: string;
}

export interface CompositionResult {
  slots: ContextSlot[];
  totalBytes: number;
  totalTokensEst: number;
  includedCount: number;
  droppedCount: number;
  budgetBytes: number;
  pressure: ContextPressure;
  redistributed: Record<ContextSlotSource, number>;
  strategy: CompositionStrategy;
}

const DEFAULT_WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');

export class PromptCompositor {
  private readonly providers = new Map<string, SlotProvider>();
  private readonly config: {
    enabled: boolean;
    strategy: CompositionStrategy;
    minScore: number;
    preserveReasons: boolean;
    logDecisions: boolean;
    workspacePath: string;
    pressureStateFilePath?: string;
    budget?: BudgetManagerConfig;
  };
  private readonly pressureMonitor: ContextPressureMonitor;
  private readonly logFilePath: string;

  constructor(config: PromptCompositorConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      strategy: config.strategy ?? 'passthrough',
      minScore: config.minScore ?? 0.25,
      preserveReasons: config.preserveReasons ?? true,
      logDecisions: config.logDecisions ?? true,
      workspacePath: config.workspacePath ?? DEFAULT_WORKSPACE,
      pressureStateFilePath: config.pressureStateFilePath,
      budget: config.budget,
    };

    this.pressureMonitor = new ContextPressureMonitor(config.pressureStateFilePath);
    this.logFilePath = path.join(
      this.config.workspacePath,
      'state',
      'clawtext',
      'prod',
      'optimization-log.jsonl',
    );
  }

  register(provider: SlotProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  compose(ctx: SlotContext): CompositionResult {
    const budgetManager = new BudgetManager({
      contextWindowTokens: ctx.modelContextWindowTokens,
      ...(this.config.budget ?? {}),
    });

    const allocations = budgetManager.allocate();
    const providerSlots = this.fillProviderSlots(ctx, allocations);
    const usageBySource = this.usageBySource(providerSlots);
    const redistribution = budgetManager.redistribute(allocations, usageBySource);

    this.refillRedistributedProviders(ctx, redistribution.allocations, redistribution.redistributed, providerSlots);

    const selected = this.applyStrategy(providerSlots, redistribution.allocations);
    const pressure = this.applyPressurePruning(selected, ctx);

    const slots = [...selected.values()].flatMap((entry) => entry.slots);
    const included = slots.filter((slot) => slot.included);
    const totalBytes = included.reduce((sum, slot) => sum + slot.bytes, 0);
    const totalTokensEst = Math.ceil(totalBytes / 4);

    this.pressureMonitor.recordTurn(totalTokensEst);
    this.pressureMonitor.save();

    const result: CompositionResult = {
      slots,
      totalBytes,
      totalTokensEst,
      includedCount: included.length,
      droppedCount: slots.length - included.length,
      budgetBytes: budgetManager.totalBudgetBytes(),
      pressure,
      redistributed: redistribution.redistributed,
      strategy: this.config.strategy,
    };

    this.logDecision(result, ctx.sessionKey);
    return result;
  }

  logDecision(result: CompositionResult, sessionKey: string): void {
    if (!this.config.logDecisions) return;

    const originalBytes = result.slots.reduce((sum, slot) => sum + slot.bytes, 0);
    const payload = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      sessionKey,
      strategy: result.strategy,
      budgetBytes: result.budgetBytes,
      originalBytes,
      totalBytes: result.totalBytes,
      totalTokensEst: result.totalTokensEst,
      includedCount: result.includedCount,
      droppedCount: result.droppedCount,
      pressure: result.pressure,
      redistributed: result.redistributed,
      slots: result.slots,
    };

    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.appendFileSync(this.logFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
  }

  private fillProviderSlots(
    ctx: SlotContext,
    allocations: Record<ContextSlotSource, SlotBudgetAllocation>,
  ): Map<string, { provider: SlotProvider; slots: ContextSlot[] }> {
    const sorted = [...this.providers.values()].sort((a, b) => a.priority - b.priority);
    const providerSlots = new Map<string, { provider: SlotProvider; slots: ContextSlot[] }>();

    for (const provider of sorted) {
      if (!provider.available(ctx)) continue;

      const budget = allocations[provider.source]?.budgetBytes ?? 0;
      const slots = this.normalizeSlots(provider.fill(ctx, budget), provider.source, provider.id);
      providerSlots.set(provider.id, { provider, slots });
    }

    return providerSlots;
  }

  private refillRedistributedProviders(
    ctx: SlotContext,
    allocations: Record<ContextSlotSource, SlotBudgetAllocation>,
    redistributed: Record<ContextSlotSource, number>,
    providerSlots: Map<string, { provider: SlotProvider; slots: ContextSlot[] }>,
  ): void {
    if (Object.values(redistributed).every((value) => value <= 0)) return;

    for (const [providerId, entry] of providerSlots.entries()) {
      const extra = redistributed[entry.provider.source] ?? 0;
      if (extra <= 0) continue;
      if (!entry.provider.available(ctx)) continue;

      const budget = allocations[entry.provider.source]?.budgetBytes ?? 0;
      const refilled = this.normalizeSlots(
        entry.provider.fill(ctx, budget),
        entry.provider.source,
        providerId,
      );
      providerSlots.set(providerId, { provider: entry.provider, slots: refilled });
    }
  }

  private applyStrategy(
    providerSlots: Map<string, { provider: SlotProvider; slots: ContextSlot[] }>,
    allocations: Record<ContextSlotSource, SlotBudgetAllocation>,
  ): Map<string, { provider: SlotProvider; slots: ContextSlot[] }> {
    if (!this.config.enabled || this.config.strategy === 'passthrough') {
      providerSlots.forEach((entry) => {
        entry.slots.forEach((slot) => {
          slot.included = true;
          if (!slot.reason) slot.reason = 'passthrough';
        });
      });
      return providerSlots;
    }

    const minScore = Math.max(0, Math.min(1, this.config.minScore));

    providerSlots.forEach((entry) => {
      const budget = allocations[entry.provider.source]?.budgetBytes ?? 0;
      const ranking =
        this.config.strategy === 'budget-trim'
          ? [...entry.slots]
          : [...entry.slots].sort((a, b) => b.score - a.score || a.bytes - b.bytes);

      let bytesUsed = 0;
      for (const slot of ranking) {
        const eligible = slot.score >= minScore;
        const fits = bytesUsed + slot.bytes <= budget;

        if (eligible && fits) {
          slot.included = true;
          bytesUsed += slot.bytes;
          if (this.config.preserveReasons) {
            slot.reason = `${slot.reason} include:score>=${minScore.toFixed(2)} budget:${bytesUsed}/${budget}`.trim();
          } else {
            slot.reason = 'included';
          }
        } else {
          slot.included = false;
          slot.reason = !eligible
            ? `drop:minScore(${slot.score.toFixed(2)}<${minScore.toFixed(2)})`
            : `drop:slotBudget(${bytesUsed + slot.bytes}>${budget})`;
        }
      }
    });

    return providerSlots;
  }

  private applyPressurePruning(
    providerSlots: Map<string, { provider: SlotProvider; slots: ContextSlot[] }>,
    ctx: SlotContext,
  ): ContextPressure {
    const slots = [...providerSlots.values()].flatMap((entry) => entry.slots);
    const includedBytes = slots
      .filter((slot) => slot.included)
      .reduce((sum, slot) => sum + slot.bytes, 0);
    const usedTokens = Math.ceil(includedBytes / 4);
    const pressure = this.pressureMonitor.assess(ctx.modelContextWindowTokens, usedTokens);

    if (pressure.aggressiveness < 0.2) {
      return pressure;
    }

    let targetFreeBytes = Math.floor(includedBytes * pressure.aggressiveness * 0.3);
    if (targetFreeBytes <= 0) return pressure;

    const pruneCandidates = [...providerSlots.values()]
      .filter((entry) => entry.provider.prunable)
      .sort((a, b) => b.provider.priority - a.provider.priority);

    for (const candidate of pruneCandidates) {
      if (targetFreeBytes <= 0) break;

      const included = candidate.slots.filter((slot) => slot.included);
      if (included.length === 0) continue;

      const beforeBytes = included.reduce((sum, slot) => sum + slot.bytes, 0);

      let prunedSlots: ContextSlot[];
      if (candidate.provider.prune) {
        prunedSlots = this.normalizeSlots(
          candidate.provider.prune(included, targetFreeBytes, pressure.aggressiveness),
          candidate.provider.source,
          candidate.provider.id,
        );
      } else {
        prunedSlots = [...included]
          .sort((a, b) => a.score - b.score || b.bytes - a.bytes)
          .reduce<ContextSlot[]>((acc, slot) => {
            const used = acc.reduce((sum, s) => sum + s.bytes, 0);
            const cap = Math.max(0, beforeBytes - targetFreeBytes);
            if (used + slot.bytes <= cap) {
              acc.push({ ...slot, included: true, reason: `${slot.reason} prune:kept`.trim() });
            }
            return acc;
          }, []);
      }

      const retainedIds = new Set(prunedSlots.map((slot) => slot.id));
      candidate.slots = candidate.slots.map((slot) => {
        if (!slot.included) return slot;
        if (retainedIds.has(slot.id)) return slot;
        return {
          ...slot,
          included: false,
          reason: `${slot.reason} prune:pressure(${pressure.aggressiveness.toFixed(2)})`.trim(),
        };
      });

      const afterBytes = candidate.slots
        .filter((slot) => slot.included)
        .reduce((sum, slot) => sum + slot.bytes, 0);
      targetFreeBytes -= Math.max(0, beforeBytes - afterBytes);
    }

    return pressure;
  }

  private usageBySource(
    providerSlots: Map<string, { provider: SlotProvider; slots: ContextSlot[] }>,
  ): Partial<Record<ContextSlotSource, number>> {
    const usage: Partial<Record<ContextSlotSource, number>> = {};

    providerSlots.forEach((entry) => {
      const bytes = entry.slots.reduce((sum, slot) => sum + slot.bytes, 0);
      usage[entry.provider.source] = (usage[entry.provider.source] ?? 0) + bytes;
    });

    return usage;
  }

  private normalizeSlots(slots: ContextSlot[], source: ContextSlotSource, providerId: string): ContextSlot[] {
    return (slots ?? []).map((slot, index) => {
      const content = typeof slot.content === 'string' ? slot.content : '';
      const bytes = slot.bytes > 0 ? slot.bytes : Buffer.byteLength(content, 'utf8');

      return {
        id: slot.id || `${providerId}:${index + 1}`,
        source: slot.source ?? source,
        content,
        score: Math.max(0, Math.min(1, slot.score ?? 0)),
        bytes,
        included: Boolean(slot.included),
        reason: slot.reason ?? '',
      };
    });
  }
}
