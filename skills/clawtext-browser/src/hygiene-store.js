/**
 * hygiene-store.js
 *
 * Manages hygiene patterns — regexes that redact sensitive data
 * before it enters the memory buffer.
 *
 * Source of truth: memory/hygiene-patterns.json
 * Shared between:
 *   - clawtext-extract hook (reads on startup, applies before buffer write)
 *   - clawtext-browser API (manage + test patterns)
 *   - ingest pipeline (strips before writing daily files)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME, '.openclaw', 'workspace');
const PATTERNS_FILE = join(WORKSPACE, 'memory', 'hygiene-patterns.json');

// ─── Built-in patterns (always present, user can disable but not delete) ────

const BUILTIN_PATTERNS = [
  {
    id: 'openai-key',
    name: 'OpenAI API Key',
    regex: 'sk-[a-zA-Z0-9]{32,}',
    flags: 'g',
    replacement: '[REDACTED:openai-key]',
    severity: 'critical',
    example: 'sk-abc123...',
  },
  {
    id: 'openai-project-key',
    name: 'OpenAI Project Key',
    regex: 'sk-proj-[a-zA-Z0-9_-]{32,}',
    flags: 'g',
    replacement: '[REDACTED:openai-key]',
    severity: 'critical',
    example: 'sk-proj-abc123...',
  },
  {
    id: 'anthropic-key',
    name: 'Anthropic API Key',
    regex: 'sk-ant-[a-zA-Z0-9_-]{32,}',
    flags: 'g',
    replacement: '[REDACTED:anthropic-key]',
    severity: 'critical',
    example: 'sk-ant-api03-...',
  },
  {
    id: 'github-pat',
    name: 'GitHub Personal Access Token',
    regex: 'gh[pousr]_[A-Za-z0-9_]{36,}',
    flags: 'g',
    replacement: '[REDACTED:github-token]',
    severity: 'critical',
    example: 'ghp_abc123...',
  },
  {
    id: 'discord-token',
    name: 'Discord Bot Token',
    regex: '[MN][A-Za-z0-9]{23}\\.[A-Za-z0-9_-]{6}\\.[A-Za-z0-9_-]{27}',
    flags: 'g',
    replacement: '[REDACTED:discord-token]',
    severity: 'critical',
    example: 'MTIzNDU2Nzg5...',
  },
  {
    id: 'aws-key-id',
    name: 'AWS Access Key ID',
    regex: 'AKIA[0-9A-Z]{16}',
    flags: 'g',
    replacement: '[REDACTED:aws-key-id]',
    severity: 'critical',
    example: 'AKIAIOSFODNN7EXAMPLE',
  },
  {
    id: 'aws-secret',
    name: 'AWS Secret Access Key',
    regex: '(?<=aws_secret_access_key\\s*=\\s*)[A-Za-z0-9/+=]{40}',
    flags: 'gi',
    replacement: '[REDACTED:aws-secret]',
    severity: 'critical',
    example: 'aws_secret_access_key = abc123...',
  },
  {
    id: 'jwt',
    name: 'JWT Token',
    regex: 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
    flags: 'g',
    replacement: '[REDACTED:jwt]',
    severity: 'high',
    example: 'eyJhbGciOiJIUzI1NiJ9...',
  },
  {
    id: 'bearer-token',
    name: 'Bearer Token (Authorization header)',
    regex: '(?<=Bearer\\s)[A-Za-z0-9._\\-]{20,}',
    flags: 'g',
    replacement: '[REDACTED:bearer-token]',
    severity: 'high',
    example: 'Authorization: Bearer abc123...',
  },
  {
    id: 'tailscale-key',
    name: 'Tailscale Auth Key',
    regex: 'tskey-[a-zA-Z0-9\\-]{20,}',
    flags: 'g',
    replacement: '[REDACTED:tailscale-key]',
    severity: 'critical',
    example: 'tskey-auth-abc123...',
  },
  {
    id: 'private-key-block',
    name: 'PEM Private Key Block',
    regex: '-----BEGIN [A-Z ]+KEY-----[\\s\\S]+?-----END [A-Z ]+KEY-----',
    flags: 'g',
    replacement: '[REDACTED:private-key-block]',
    severity: 'critical',
    example: '-----BEGIN RSA PRIVATE KEY-----...',
  },
  {
    id: 'password-in-url',
    name: 'Password in URL',
    regex: '(?<=://)([^:@/\\s]+):([^@/\\s]{6,})(?=@)',
    flags: 'g',
    replacement: '[REDACTED:url-credentials]',
    severity: 'high',
    example: 'postgres://user:password@host',
  },
  {
    id: 'password-field',
    name: 'Password Assignment',
    regex: '(?:password|passwd|pwd)\\s*[=:]\\s*[\'"]?(?!\\[REDACTED)[^\\s\'"#,;]{8,}',
    flags: 'gi',
    replacement: '[REDACTED:password]',
    severity: 'high',
    example: 'password = "hunter2"',
    warn: 'May produce false positives on config examples. Review carefully.',
  },
  {
    id: 'generic-api-key-assignment',
    name: 'Generic API Key Assignment',
    regex: '(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token)\\s*[=:]\\s*[\'"]?(?!\\[REDACTED)[A-Za-z0-9._\\-]{16,}',
    flags: 'gi',
    replacement: '[REDACTED:api-key]',
    severity: 'medium',
    example: 'api_key = "abc123abcdef..."',
    warn: 'Broad pattern — may match config keys with values that look like identifiers.',
  },
];

// ─── Store ───────────────────────────────────────────────────────────────────

function load() {
  if (!existsSync(PATTERNS_FILE)) {
    return {
      enabled: true,
      customPatterns: [],
      disabledBuiltins: [],
      updatedAt: new Date().toISOString(),
    };
  }
  try { return JSON.parse(readFileSync(PATTERNS_FILE, 'utf8')); }
  catch { return { enabled: true, customPatterns: [], disabledBuiltins: [], updatedAt: new Date().toISOString() }; }
}

function save(state) {
  state.updatedAt = new Date().toISOString();
  writeFileSync(PATTERNS_FILE, JSON.stringify(state, null, 2));
}

export function getPatterns() {
  const state = load();
  const disabledSet = new Set(state.disabledBuiltins || []);

  const builtins = BUILTIN_PATTERNS.map(p => ({
    ...p,
    builtin: true,
    enabled: !disabledSet.has(p.id),
  }));

  const custom = (state.customPatterns || []).map(p => ({
    ...p,
    builtin: false,
    enabled: p.enabled !== false,
  }));

  return { enabled: state.enabled !== false, patterns: [...builtins, ...custom] };
}

export function setGlobalEnabled(enabled) {
  const state = load();
  state.enabled = enabled;
  save(state);
}

export function setPatternEnabled(id, enabled) {
  const state = load();
  const builtin = BUILTIN_PATTERNS.find(p => p.id === id);

  if (builtin) {
    const set = new Set(state.disabledBuiltins || []);
    enabled ? set.delete(id) : set.add(id);
    state.disabledBuiltins = [...set];
  } else {
    const idx = (state.customPatterns || []).findIndex(p => p.id === id);
    if (idx !== -1) state.customPatterns[idx].enabled = enabled;
  }
  save(state);
}

export function addCustomPattern({ name, regex, flags = 'g', replacement, severity = 'medium', warn = null }) {
  const state = load();
  // Validate regex compiles
  try { new RegExp(regex, flags.replace('g', '')); }
  catch (e) { throw new Error(`Invalid regex: ${e.message}`); }

  const id = `custom-${Date.now()}`;
  state.customPatterns = state.customPatterns || [];
  state.customPatterns.push({ id, name, regex, flags, replacement, severity, warn, enabled: true, createdAt: new Date().toISOString() });
  save(state);
  return id;
}

export function deleteCustomPattern(id) {
  const state = load();
  const before = state.customPatterns?.length || 0;
  state.customPatterns = (state.customPatterns || []).filter(p => p.id !== id);
  if (state.customPatterns.length < before) { save(state); return true; }
  return false;
}

// ─── Core sanitize function ──────────────────────────────────────────────────

/**
 * Sanitize text by applying all enabled hygiene patterns.
 * Returns { text: sanitized string, redactions: [{patternId, count}] }
 */
export function sanitize(text) {
  if (!text || typeof text !== 'string') return { text: text || '', redactions: [] };

  const { enabled, patterns } = getPatterns();
  if (!enabled) return { text, redactions: [] };

  let result = text;
  const redactions = [];

  for (const pattern of patterns) {
    if (!pattern.enabled) continue;
    try {
      const re = new RegExp(pattern.regex, pattern.flags || 'g');
      let count = 0;
      result = result.replace(re, () => { count++; return pattern.replacement; });
      if (count > 0) redactions.push({ patternId: pattern.id, patternName: pattern.name, count });
    } catch {
      // Skip bad patterns rather than crashing
    }
  }

  return { text: result, redactions };
}

/**
 * Scan text for matches without replacing.
 * Returns list of matches with context snippets.
 */
export function scan(text) {
  if (!text) return { matches: [] };
  const { enabled, patterns } = getPatterns();
  if (!enabled) return { matches: [] };

  const matches = [];
  for (const pattern of patterns) {
    if (!pattern.enabled) continue;
    try {
      const re = new RegExp(pattern.regex, (pattern.flags || 'g').includes('g') ? pattern.flags : pattern.flags + 'g');
      const found = [...text.matchAll(re)];
      for (const match of found) {
        const start = Math.max(0, match.index - 20);
        const end = Math.min(text.length, match.index + match[0].length + 20);
        matches.push({
          patternId: pattern.id,
          patternName: pattern.name,
          severity: pattern.severity,
          snippet: `...${text.slice(start, end).replace(/\n/g, ' ')}...`,
          replacement: pattern.replacement,
        });
      }
    } catch {}
  }
  return { matches };
}

export function getStats() {
  const { enabled, patterns } = getPatterns();
  return {
    globalEnabled: enabled,
    total: patterns.length,
    builtin: patterns.filter(p => p.builtin).length,
    custom: patterns.filter(p => !p.builtin).length,
    active: patterns.filter(p => p.enabled).length,
    disabled: patterns.filter(p => !p.enabled).length,
    bySeverity: {
      critical: patterns.filter(p => p.enabled && p.severity === 'critical').length,
      high:     patterns.filter(p => p.enabled && p.severity === 'high').length,
      medium:   patterns.filter(p => p.enabled && p.severity === 'medium').length,
    },
  };
}
