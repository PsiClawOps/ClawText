/**
 * Anti-Pattern API — /api/anti-patterns
 * 
 * All CRUD + lifecycle operations for managing memory walls.
 */
import { Router } from 'express';
import { ANTI_PATTERN_STATUS } from '../anti-pattern-store.js';

const router = Router();

export default function antiPatternRoutes(antiPatternStore, memoryStore) {

  /**
   * GET /api/anti-patterns
   * List all anti-patterns. Optional filter: ?status=proposed
   */
  router.get('/', (req, res) => {
    const { status } = req.query;
    const patterns = antiPatternStore.getAll(status ? { status } : undefined);
    res.json({ patterns, total: patterns.length });
  });

  /**
   * GET /api/anti-patterns/check?from=RGCS&to=RageFX
   * Must be registered BEFORE /:id to avoid route conflict.
   */
  router.get('/check', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: '"from" and "to" are required' });
    }
    const result = antiPatternStore.check(from, to);
    res.json({
      hasWall: !!result && result.status !== ANTI_PATTERN_STATUS.DISMISSED,
      type: result?.status ?? null,
      pattern: result ?? null,
    });
  });

  /**
   * GET /api/anti-patterns/blocked-for/:entity
   * Must be registered BEFORE /:id to avoid route conflict.
   */
  router.get('/blocked-for/:entity', (req, res) => {
    const blocked = antiPatternStore.getBlockedEntitiesFor(req.params.entity);
    res.json({ entity: req.params.entity, blocked });
  });

  /**
   * GET /api/anti-patterns/:id
   */
  router.get('/:id', (req, res) => {
    const pattern = antiPatternStore.getById(req.params.id);
    if (!pattern) return res.status(404).json({ error: 'Not found' });
    res.json(pattern);
  });

  /**
   * POST /api/anti-patterns
   * Create a new anti-pattern (manual, from UI).
   * 
   * Body: { from, to, reason, partialNote?, tags? }
   */
  router.post('/', (req, res) => {
    const { from, to, reason, partialNote, tags, status } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: '"from" and "to" are required' });
    }

    // Check for duplicate
    const existing = antiPatternStore.check(from, to);
    if (existing && existing.status !== ANTI_PATTERN_STATUS.DISMISSED) {
      return res.status(409).json({
        error: 'Anti-pattern already exists',
        existing,
      });
    }

    const pattern = antiPatternStore.create({
      from,
      to,
      reason: reason || '',
      partialNote: partialNote || null,
      agentProposed: false,
      tags: tags || [],
      initialStatus: status || null,
    });

    res.status(201).json(pattern);
  });

  /**
   * POST /api/anti-patterns/propose
   * Agent proposes an anti-pattern (status: proposed, pending user confirmation).
   * 
   * Body: { from, to, reason, confidence, agentSessionId? }
   */
  router.post('/propose', (req, res) => {
    const { from, to, reason, confidence, agentSessionId } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: '"from" and "to" are required' });
    }

    const existing = antiPatternStore.check(from, to);
    if (existing && existing.status !== ANTI_PATTERN_STATUS.DISMISSED) {
      return res.status(409).json({ error: 'Wall already exists', existing });
    }

    const pattern = antiPatternStore.create({
      from,
      to,
      reason: reason || 'Agent detected potential false association',
      agentProposed: true,
      tags: ['agent-proposed', ...(confidence ? [`confidence:${confidence}`] : [])],
    });

    res.status(201).json({ pattern, pendingConfirmation: true });
  });

  /**
   * PATCH /api/anti-patterns/:id/confirm
   * User confirms a proposed anti-pattern.
   * Body: { reason?, partialNote? }
   */
  router.patch('/:id/confirm', (req, res) => {
    const updated = antiPatternStore.confirm(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  /**
   * PATCH /api/anti-patterns/:id/partial
   * User marks as partial — "similar in X, different in Y".
   * Body: { partialNote: "QML patterns transfer; smoothing does NOT" }
   */
  router.patch('/:id/partial', (req, res) => {
    const { partialNote } = req.body;
    if (!partialNote) {
      return res.status(400).json({ error: '"partialNote" is required for partial status' });
    }
    const updated = antiPatternStore.markPartial(req.params.id, partialNote);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  /**
   * PATCH /api/anti-patterns/:id/dismiss
   * User dismisses — these ARE related, destroy the wall.
   */
  router.patch('/:id/dismiss', (req, res) => {
    const updated = antiPatternStore.dismiss(req.params.id);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  /**
   * PATCH /api/anti-patterns/:id
   * General purpose update.
   * Body: any subset of { from, to, reason, partialNote, tags, status }
   */
  router.patch('/:id', (req, res) => {
    const allowed = ['from', 'to', 'reason', 'partialNote', 'tags'];
    const patch = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    const updated = antiPatternStore.update(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  /**
   * DELETE /api/anti-patterns/:id
   */
  router.delete('/:id', (req, res) => {
    const deleted = antiPatternStore.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });

  return router;
}
