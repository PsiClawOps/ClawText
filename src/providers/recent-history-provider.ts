import type { ContextSlot, SlotContext, SlotProvider } from '../slot-provider.js';

export interface HistoryMessage {
  id?: string;
  content: string;
  ts?: number | string;
  role?: string;
}

type MessageResolver = (ctx: SlotContext) => HistoryMessage[];

export interface RecentHistoryProviderOptions {
  getMessages: MessageResolver;
  avgMessageBytes?: number;
}

function estimateAverageMessageBytes(messages: HistoryMessage[], fallback: number): number {
  const sizes = messages
    .map((message) => Buffer.byteLength(String(message.content ?? ''), 'utf8'))
    .filter((n) => n > 0);

  if (sizes.length === 0) return fallback;
  return Math.max(1, Math.floor(sizes.reduce((sum, n) => sum + n, 0) / sizes.length));
}

export class RecentHistoryProvider implements SlotProvider {
  readonly id = 'recent-history';
  readonly source = 'recent-history' as const;
  readonly priority = 80;
  readonly prunable = false;

  private readonly getMessages: MessageResolver;
  private readonly avgMessageBytes: number;

  constructor(options: RecentHistoryProviderOptions) {
    this.getMessages = options.getMessages;
    this.avgMessageBytes = Math.max(32, Math.floor(options.avgMessageBytes ?? 280));
  }

  available(_ctx: SlotContext): boolean {
    return true;
  }

  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[] {
    const messages = this.getMessages(ctx);
    if (messages.length === 0 || budgetBytes <= 0) return [];

    const avgBytes = estimateAverageMessageBytes(messages, this.avgMessageBytes);
    const count = Math.max(1, Math.floor(budgetBytes / avgBytes));
    const recent = messages.slice(-count);

    return recent.map((message, index) => {
      const content = String(message.content ?? '');
      return {
        id: message.id ?? `recent-history:${messages.length - recent.length + index + 1}`,
        source: this.source,
        content,
        score: 1,
        bytes: Buffer.byteLength(content, 'utf8'),
        included: false,
        reason: 'recent verbatim',
      };
    });
  }
}
