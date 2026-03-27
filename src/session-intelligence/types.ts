/**
 * Session Intelligence local types.
 *
 * This module defines SQLite row types, content taxonomy, runtime config,
 * and internal state used by the context-engine implementation.
 */

import type { CompactorConfig } from './compactor';
import type { ContentType } from './content-type';

export type ConversationRow = {
  id: number;
  session_key: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
};

export type MessageRow = {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  content_type: ContentType;
  token_count: number | null;
  message_index: number;
  is_heartbeat: number;
  summarized: number;
  created_at: string;
};

export type MessagePartRow = {
  id: number;
  message_id: number;
  part_type: string;
  content: string | null;
  metadata: string | null;
};

export type CompactionTriggerConfig = {
  // Fraction of token budget at which compaction is triggered automatically
  // Default: 0.75 (compact when 75% of budget consumed)
  pressureThreshold: number;

  // Minimum number of messages before compaction is eligible
  // Default: 10
  minMessages: number;

  // Cooldown between automatic compactions (milliseconds)
  // Default: 60_000 (1 minute)
  cooldownMs: number;
};

export type SessionIntelligenceConfig = {
  workspacePath: string;
  defaultTokenBudget?: number;
  compactor?: Partial<CompactorConfig>;
  compactionTrigger?: Partial<CompactionTriggerConfig>;
  summarizationApi?: {
    complete(model: string, prompt: string): Promise<string>;
  };
};

export type ConversationState = {
  sessionId: string;
  conversationId: number;
};

export type PersistMessageInput = {
  role: string;
  content: string;
  contentType: ContentType;
  tokenCount: number;
};
