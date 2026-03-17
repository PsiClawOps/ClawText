import type { SlotProvider, SlotContext, ContextSlot } from '../slot-provider.js';

// Phase 2 stub — will read from ClawCanvas room metadata
// Currently delegates to cross-session-provider for journal-based awareness
export class SituationalAwarenessProvider implements SlotProvider {
  id = 'situational-awareness';
  source = 'situational-awareness' as const;
  priority = 20;
  prunable = true;

  available(_ctx: SlotContext): boolean { return false; } // disabled until Phase 2
  fill(_ctx: SlotContext, _budgetBytes: number): ContextSlot[] { return []; }
  prune(_slots: ContextSlot[], _targetFreeBytes: number, _aggressiveness: number): ContextSlot[] { return []; }
}
