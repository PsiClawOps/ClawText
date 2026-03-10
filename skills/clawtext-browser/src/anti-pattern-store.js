/**
 * Anti-Pattern Schema
 *
 * An anti-pattern is a user-confirmed negative association between two entities or clusters.
 * It tells the RAG layer: "do NOT inject memories from entity B when entity A is active context."
 * 
 * Status lifecycle:
 *   proposed → agent saw possible link, not yet user-confirmed
 *   confirmed → user explicitly said "no, these are different"
 *   partial   → user said "similar in X but not Y" (nuanced wall)
 *   dismissed → user said "actually they ARE related" — delete this anti-pattern
 */

/**
 * @typedef {Object} AntiPattern
 * @property {string} id          - UUID
 * @property {string} from        - Source entity name or cluster ID
 * @property {string} to          - Target entity name or cluster ID  
 * @property {"proposed"|"confirmed"|"partial"|"dismissed"} status
 * @property {string} reason      - Why they are different (user's words)
 * @property {string|null} partialNote  - If partial: what IS shared (e.g. "QML patterns apply, but not smoothing")
 * @property {boolean} agentProposed  - true = agent proposed; false = user created manually
 * @property {string} createdAt   - ISO timestamp
 * @property {string} updatedAt   - ISO timestamp
 * @property {string|null} confirmedBy - "user" or agent session ID
 * @property {string[]} tags      - Optional labels for grouping
 */

export const ANTI_PATTERN_STATUS = {
  PROPOSED: 'proposed',
  CONFIRMED: 'confirmed',
  PARTIAL: 'partial',
  DISMISSED: 'dismissed',
};

/**
 * Example real-world anti-pattern (from your RageFX/RGCS case):
 * 
 * {
 *   id: "ap_01abc...",
 *   from: "RGCS.smoothing",
 *   to: "RageFX.ui",
 *   status: "partial",
 *   reason: "RGCS smoothing is motion stabilization; RageFX UI is color grading overlay",
 *   partialNote: "Both use QML — that learning transfers. Smoothing concepts do NOT.",
 *   agentProposed: true,
 *   createdAt: "2026-03-10T09:48:00Z",
 *   updatedAt: "2026-03-10T09:48:00Z",
 *   confirmedBy: "user",
 *   tags: ["cross-project-contamination"]
 * }
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export class AntiPatternStore {
  constructor(memoryDir) {
    this.filePath = join(memoryDir, 'anti-patterns.json');
    this.patterns = this._load();
  }

  _load() {
    if (!existsSync(this.filePath)) return [];
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8'));
    } catch {
      return [];
    }
  }

  _save() {
    writeFileSync(this.filePath, JSON.stringify(this.patterns, null, 2));
  }

  getAll({ status } = {}) {
    if (status) return this.patterns.filter(p => p.status === status);
    return this.patterns;
  }

  getById(id) {
    return this.patterns.find(p => p.id === id) ?? null;
  }

  /**
   * Check if two entities have a confirmed wall between them.
   * Returns null (no wall), "confirmed" (hard block), or "partial" (nuanced block).
   */
  check(entityA, entityB) {
    const match = this.patterns.find(p =>
      p.status !== ANTI_PATTERN_STATUS.DISMISSED &&
      ((p.from === entityA && p.to === entityB) ||
       (p.from === entityB && p.to === entityA))
    );
    return match ?? null;
  }

  create({ from, to, reason = '', partialNote = null, agentProposed = false, tags = [], initialStatus = null }) {
    const now = new Date().toISOString();
    let status;
    if (initialStatus && Object.values(ANTI_PATTERN_STATUS).includes(initialStatus)) {
      status = initialStatus;
    } else {
      status = agentProposed ? ANTI_PATTERN_STATUS.PROPOSED : ANTI_PATTERN_STATUS.CONFIRMED;
    }
    const pattern = {
      id: `ap_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      from, to, status, reason, partialNote, agentProposed,
      createdAt: now, updatedAt: now,
      confirmedBy: agentProposed ? null : 'user',
      tags,
    };
    this.patterns.push(pattern);
    this._save();
    return pattern;
  }

  update(id, patch) {
    const idx = this.patterns.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.patterns[idx] = {
      ...this.patterns[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this._save();
    return this.patterns[idx];
  }

  /**
   * User confirms a proposed anti-pattern.
   */
  confirm(id, { reason, partialNote } = {}) {
    return this.update(id, {
      status: ANTI_PATTERN_STATUS.CONFIRMED,
      confirmedBy: 'user',
      ...(reason ? { reason } : {}),
      ...(partialNote !== undefined ? { partialNote } : {}),
    });
  }

  /**
   * User says "partial" — shared in some ways, not others.
   */
  markPartial(id, partialNote) {
    return this.update(id, {
      status: ANTI_PATTERN_STATUS.PARTIAL,
      partialNote,
      confirmedBy: 'user',
    });
  }

  /**
   * User dismisses — these ARE related, delete the wall.
   */
  dismiss(id) {
    return this.update(id, {
      status: ANTI_PATTERN_STATUS.DISMISSED,
      confirmedBy: 'user',
    });
  }

  delete(id) {
    const before = this.patterns.length;
    this.patterns = this.patterns.filter(p => p.id !== id);
    if (this.patterns.length < before) { this._save(); return true; }
    return false;
  }

  /**
   * For RAG filtering: given active entity, return all entities
   * that should NOT be co-injected (all confirmed/partial walls).
   */
  getBlockedEntitiesFor(entity) {
    return this.patterns
      .filter(p =>
        p.status !== ANTI_PATTERN_STATUS.DISMISSED &&
        p.status !== ANTI_PATTERN_STATUS.PROPOSED &&
        (p.from === entity || p.to === entity)
      )
      .map(p => ({
        blockedEntity: p.from === entity ? p.to : p.from,
        status: p.status,
        partialNote: p.partialNote,
        reason: p.reason,
      }));
  }
}
