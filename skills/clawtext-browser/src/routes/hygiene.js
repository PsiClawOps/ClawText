/**
 * routes/hygiene.js — Memory hygiene pattern management API
 */

import express from 'express';
import {
  getPatterns, getStats,
  setGlobalEnabled, setPatternEnabled,
  addCustomPattern, deleteCustomPattern,
  sanitize, scan,
} from '../hygiene-store.js';

const router = express.Router();

// GET /api/hygiene/stats
router.get('/stats', (req, res) => {
  res.json(getStats());
});

// GET /api/hygiene/patterns
router.get('/patterns', (req, res) => {
  res.json(getPatterns());
});

// POST /api/hygiene/test
// Body: { text: "string to test" }
// Returns: { sanitized, redactions, matches (pre-sanitize scan) }
router.post('/test', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const scanned = scan(text);
  const sanitized = sanitize(text);

  res.json({
    original: text,
    sanitized: sanitized.text,
    changed: sanitized.text !== text,
    redactions: sanitized.redactions,
    matches: scanned.matches,
  });
});

// POST /api/hygiene/scan
// Body: { text } — scan only (no replacement), used for existing memory audit
router.post('/scan', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  res.json(scan(text));
});

// PATCH /api/hygiene/global
// Body: { enabled: true|false }
router.patch('/global', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required' });
  setGlobalEnabled(enabled);
  res.json({ ok: true, enabled });
});

// PATCH /api/hygiene/patterns/:id/toggle
// Body: { enabled: true|false }
router.patch('/patterns/:id/toggle', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required' });
  setPatternEnabled(req.params.id, enabled);
  res.json({ ok: true, id: req.params.id, enabled });
});

// POST /api/hygiene/patterns
// Body: { name, regex, flags?, replacement, severity?, warn? }
router.post('/patterns', (req, res) => {
  const { name, regex, flags, replacement, severity, warn } = req.body;
  if (!name || !regex || !replacement) {
    return res.status(400).json({ error: 'name, regex, and replacement are required' });
  }
  try {
    const id = addCustomPattern({ name, regex, flags, replacement, severity, warn });
    res.status(201).json({ ok: true, id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/hygiene/patterns/:id
// Can only delete custom patterns (not builtins)
router.delete('/patterns/:id', (req, res) => {
  const deleted = deleteCustomPattern(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Custom pattern not found (cannot delete builtins)' });
  res.json({ ok: true });
});

// POST /api/hygiene/audit-memory
// Body: { limit?: number } — scans existing memory cluster content for leaks
router.post('/audit-memory', async (req, res) => {
  const memoryStore = req.app.get('memoryStore');
  if (!memoryStore) return res.status(500).json({ error: 'memoryStore not available' });

  const limit = Math.min(parseInt(req.body?.limit || 100), 500);
  const findings = [];

  for (const mem of memoryStore.memories.slice(0, limit)) {
    const text = [mem.content, mem.title, (mem.keywords || []).join(' ')].filter(Boolean).join('\n');
    const { matches } = scan(text);
    if (matches.length > 0) {
      findings.push({
        memoryId: mem._id,
        clusterId: mem.clusterId,
        clusterTopic: mem.clusterTopic,
        project: mem.project,
        matchCount: matches.length,
        matches: matches.map(m => ({ patternId: m.patternId, severity: m.severity, snippet: m.snippet })),
      });
    }
  }

  res.json({
    scanned: Math.min(limit, memoryStore.memories.length),
    findingsCount: findings.length,
    findings,
  });
});

export default router;
