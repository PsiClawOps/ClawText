/**
 * ClawText Session-End Flush Hook
 *
 * Fires on agent:reset (i.e. /new command). Immediately flushes any
 * unprocessed buffer records into today's memory file using simple
 * keyword-based extraction (no LLM call — must stay synchronous and fast).
 *
 * The LLM-quality extraction still happens in the 20-min cron. This hook
 * ensures nothing is lost when a session ends between cron windows.
 */
declare const handler: (event: any) => Promise<void>;
export default handler;
//# sourceMappingURL=handler.d.ts.map