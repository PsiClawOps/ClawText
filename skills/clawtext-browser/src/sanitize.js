/**
 * sanitize.js — importable sanitizer for use in hooks and ingest pipeline
 *
 * Usage in clawtext-extract hook:
 *   import { sanitize } from '../../skills/clawtext-browser/src/sanitize.js';
 *   const { text, redactions } = sanitize(rawContent);
 *
 * Reads patterns from memory/hygiene-patterns.json at runtime.
 * Falls back to built-in patterns if file doesn't exist.
 */

import { sanitize, scan, getPatterns } from './hygiene-store.js';

export { sanitize, scan, getPatterns };

/**
 * Sanitize a message object (as used by the extract hook buffer).
 * Scrubs content, and any string fields that might carry sensitive text.
 */
export function sanitizeMessage(msg) {
  if (!msg) return msg;
  const fields = ['content', 'text', 'body', 'message'];
  const redactionLog = [];

  const scrubbed = { ...msg };
  for (const field of fields) {
    if (typeof scrubbed[field] === 'string') {
      const { text, redactions } = sanitize(scrubbed[field]);
      scrubbed[field] = text;
      if (redactions.length > 0) redactionLog.push({ field, redactions });
    }
  }

  if (redactionLog.length > 0) {
    scrubbed._hygiene = { redacted: true, log: redactionLog };
  }

  return scrubbed;
}
