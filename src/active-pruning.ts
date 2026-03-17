import type { ContextPressure } from './context-pressure.js';
import type { ContextSlot } from './slot-provider.js';

export interface PruningDecision {
  slotId: string;
  action: 'keep' | 'compress' | 'drop' | 'summarize';
  originalBytes: number;
  resultBytes: number;
  reason: string;
}

export interface PruningResult {
  decisions: PruningDecision[];
  freedBytes: number;
  freedTokensEst: number;
  aggressiveness: number;
  shouldCancelCompaction: boolean;
}

export interface PruningConfig {
  enabled: boolean;
  preserveLastNTurns: number;
  compactionAvoidanceThresholdTokens: number;
}

const ACK_PATTERN = /^(ok|yes|no|sure|thanks|perfect|nice|got it|sounds good|lets do it|lets go|keep going|yep|yup|agreed|cool|great|alright|roger|copy|understood|will do)\.?!?$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sentenceSplit(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function firstSentence(text: string): string {
  const sentences = sentenceSplit(text);
  return sentences[0] ?? text.trim();
}

function truncateToolResult(text: string): string {
  if (text.length <= 1200) return text;
  const head = text.slice(0, 500);
  const tail = text.slice(-500);
  return `${head}\n... [tool output truncated] ...\n${tail}`;
}

function summarizeToBullets(text: string, maxBullets = 5): string {
  const sentences = sentenceSplit(text)
    .map((sentence) => sentence.replace(/^[-*•]\s*/, '').trim())
    .filter((sentence) => sentence.length > 10)
    .slice(0, maxBullets);

  if (sentences.length === 0) {
    const fallback = text.trim().slice(0, 180);
    return fallback ? `- ${fallback}` : '';
  }

  return sentences.map((sentence) => `- ${sentence.slice(0, 180)}`).join('\n');
}

function isToolResult(slot: ContextSlot): boolean {
  const haystack = `${slot.id}\n${slot.content}`.toLowerCase();
  return (
    haystack.includes('tool') ||
    haystack.includes('result') ||
    haystack.includes('output') ||
    haystack.includes('stack trace') ||
    haystack.includes('traceback') ||
    /```[\s\S]+```/.test(slot.content)
  );
}

function hasDecisionSignal(slot: ContextSlot): boolean {
  const haystack = `${slot.id}\n${slot.content}`.toLowerCase();
  return slot.source === 'decision-tree' || haystack.includes('decision');
}

function buildReferenceHaystack(slots: ContextSlot[], turnLookback: number): string {
  return slots
    .slice(Math.max(0, slots.length - turnLookback))
    .map((slot) => `${slot.id} ${slot.content}`.toLowerCase())
    .join(' ');
}

function isReferenced(slot: ContextSlot, haystack: string): boolean {
  const idTokens = slot.id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3)
    .slice(0, 3);

  if (idTokens.some((token) => haystack.includes(token))) {
    return true;
  }

  const contentTokens = slot.content
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 5)
    .slice(0, 6);

  return contentTokens.some((token) => haystack.includes(token));
}

export class ActivePruner {
  private readonly config: PruningConfig;

  constructor(config: PruningConfig) {
    this.config = {
      ...config,
      preserveLastNTurns: Math.max(5, Math.floor(config.preserveLastNTurns || 5)),
      compactionAvoidanceThresholdTokens: Math.max(1, Math.floor(config.compactionAvoidanceThresholdTokens || 1)),
    };
  }

  prune(slots: ContextSlot[], pressure: ContextPressure): PruningResult {
    const aggressiveness = clamp(pressure.aggressiveness ?? 0, 0, 1);
    const decisions: PruningDecision[] = [];

    if (!this.config.enabled || aggressiveness < 0.2) {
      for (const slot of slots) {
        decisions.push({
          slotId: slot.id,
          action: 'keep',
          originalBytes: slot.bytes,
          resultBytes: slot.bytes,
          reason: this.config.enabled ? 'low-pressure-no-prune' : 'pruning-disabled',
        });
      }

      return {
        decisions,
        freedBytes: 0,
        freedTokensEst: 0,
        aggressiveness,
        shouldCancelCompaction: false,
      };
    }

    const preserveTurns = this.config.preserveLastNTurns;
    const referenceLast10 = buildReferenceHaystack(slots, 10);

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const turnDistance = slots.length - 1 - i;
      const protectedRecent = turnDistance < preserveTurns;
      const originalBytes = slot.bytes;

      if (protectedRecent) {
        decisions.push({
          slotId: slot.id,
          action: 'keep',
          originalBytes,
          resultBytes: originalBytes,
          reason: `preserve-last-${preserveTurns}-turns`,
        });
        continue;
      }

      if (aggressiveness >= 0.8) {
        if (slot.source === 'library' && !isReferenced(slot, referenceLast10)) {
          decisions.push({
            slotId: slot.id,
            action: 'drop',
            originalBytes,
            resultBytes: 0,
            reason: 'evict-stale-library-unreferenced-last-10-turns',
          });
          continue;
        }

        if (slot.source === 'deep-history' && !hasDecisionSignal(slot)) {
          const summary = summarizeToBullets(slot.content);
          const resultBytes = Buffer.byteLength(summary, 'utf8');
          decisions.push({
            slotId: slot.id,
            action: 'summarize',
            originalBytes,
            resultBytes,
            reason: 'deep-history-bullet-summary',
          });
          continue;
        }
      }

      if (aggressiveness >= 0.6 && aggressiveness < 0.8) {
        if (slot.source === 'mid-history' && !hasDecisionSignal(slot)) {
          const compressed = firstSentence(slot.content);
          const resultBytes = Buffer.byteLength(compressed, 'utf8');
          decisions.push({
            slotId: slot.id,
            action: 'compress',
            originalBytes,
            resultBytes,
            reason: 'mid-history-first-sentence-only',
          });
          continue;
        }
      }

      if (aggressiveness >= 0.4) {
        if (isToolResult(slot) && turnDistance > 15) {
          const compressed = truncateToolResult(slot.content);
          const resultBytes = Buffer.byteLength(compressed, 'utf8');
          decisions.push({
            slotId: slot.id,
            action: resultBytes < originalBytes ? 'compress' : 'keep',
            originalBytes,
            resultBytes: Math.min(resultBytes, originalBytes),
            reason: 'truncate-old-tool-result',
          });
          continue;
        }

        if (slot.source === 'memory' && !isReferenced(slot, referenceLast10)) {
          decisions.push({
            slotId: slot.id,
            action: 'drop',
            originalBytes,
            resultBytes: 0,
            reason: 'drop-unreferenced-memory-slot',
          });
          continue;
        }
      }

      if (aggressiveness >= 0.2) {
        const trimmed = slot.content.trim();
        if (turnDistance > 20 && trimmed.length < 30 && ACK_PATTERN.test(trimmed)) {
          decisions.push({
            slotId: slot.id,
            action: 'drop',
            originalBytes,
            resultBytes: 0,
            reason: 'drop-ack-noise-older-than-20-turns',
          });
          continue;
        }
      }

      decisions.push({
        slotId: slot.id,
        action: 'keep',
        originalBytes,
        resultBytes: originalBytes,
        reason: 'retain-by-policy',
      });
    }

    const freedBytes = decisions.reduce((sum, decision) => sum + Math.max(0, decision.originalBytes - decision.resultBytes), 0);
    const freedTokensEst = Math.floor(freedBytes / 4);

    return {
      decisions,
      freedBytes,
      freedTokensEst,
      aggressiveness,
      shouldCancelCompaction: this.shouldCancelCompaction(freedTokensEst),
    };
  }

  shouldCancelCompaction(freedTokens: number): boolean {
    return freedTokens >= this.config.compactionAvoidanceThresholdTokens;
  }
}
