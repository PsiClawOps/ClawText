import type { DatabaseSync } from 'node:sqlite';

export type RecoveryPriority = 'high' | 'normal' | 'low';

export type ResourceSlotAssociation = {
  id?: number;
  resourceVersionId: number;
  conversationId: string;
  slotId: string;
  slotType: string;
  slotValueSnapshot?: string;
  recoveryPriority: RecoveryPriority;
  turn: number;
  createdAt: string;
};

export function insertSlotAssociation(db: DatabaseSync, assoc: ResourceSlotAssociation): void {
  db
    .prepare(
      `INSERT INTO resource_slot_associations
        (resource_version_id, conversation_id, slot_id, slot_type, slot_value_snapshot, recovery_priority, turn, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      assoc.resourceVersionId,
      assoc.conversationId,
      assoc.slotId,
      assoc.slotType,
      assoc.slotValueSnapshot ?? null,
      assoc.recoveryPriority,
      assoc.turn,
      assoc.createdAt,
    );
}

export function getSlotAssociations(
  db: DatabaseSync,
  resourceVersionId: number,
): ResourceSlotAssociation[] {
  const rows = db
    .prepare(
      `SELECT id, resource_version_id, conversation_id, slot_id, slot_type,
              slot_value_snapshot, recovery_priority, turn, created_at
         FROM resource_slot_associations
        WHERE resource_version_id = ?`,
    )
    .all(resourceVersionId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row['id'] as number,
    resourceVersionId: row['resource_version_id'] as number,
    conversationId: row['conversation_id'] as string,
    slotId: row['slot_id'] as string,
    slotType: row['slot_type'] as string,
    slotValueSnapshot: (row['slot_value_snapshot'] as string | null) ?? undefined,
    recoveryPriority: ((row['recovery_priority'] as string) ?? 'normal') as RecoveryPriority,
    turn: row['turn'] as number,
    createdAt: row['created_at'] as string,
  }));
}

export function getRecoveryPriority(
  db: DatabaseSync,
  resourceVersionId: number,
): RecoveryPriority {
  const row = db
    .prepare(
      `SELECT recovery_priority FROM resource_slot_associations
        WHERE resource_version_id = ?
        ORDER BY CASE recovery_priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END
        LIMIT 1`,
    )
    .get(resourceVersionId) as { recovery_priority: string } | undefined;

  if (!row) return 'low';
  const p = row['recovery_priority'];
  if (p === 'high' || p === 'normal' || p === 'low') return p;
  return 'normal';
}

export function associateResourceWithSlots(
  db: DatabaseSync,
  conversationId: string,
  resourceVersionId: number,
  turn: number,
): void {
  const minTurn = turn - 3;
  const rows = db
    .prepare(
      `SELECT slot_name, slot_value, turn FROM state_slots
        WHERE conversation_id = ?
          AND slot_name IN ('active_problem', 'decisions_made')
          AND turn >= ?
        ORDER BY turn DESC
        LIMIT 6`,
    )
    .all(conversationId, minTurn) as Array<{
    slot_name: string;
    slot_value: string;
    turn: number;
  }>;

  for (const row of rows) {
    const priority: RecoveryPriority = row['slot_name'] === 'active_problem' ? 'high' : 'normal';
    const snapshot =
      typeof row['slot_value'] === 'string' ? row['slot_value'].slice(0, 500) : undefined;
    insertSlotAssociation(db, {
      resourceVersionId,
      conversationId,
      slotId: row['slot_name'],
      slotType: row['slot_name'],
      slotValueSnapshot: snapshot,
      recoveryPriority: priority,
      turn,
      createdAt: new Date().toISOString(),
    });
  }
}
