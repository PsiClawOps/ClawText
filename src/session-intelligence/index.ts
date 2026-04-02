/**
 * Session Intelligence module entrypoint.
 *
 * Exports the context-engine factory and registration helper used by
 * ClawText's main plugin registration path.
 */

import path from 'node:path';
import { createSessionIntelligenceEngine } from './engine';
import type { SessionIntelligenceConfig } from './types';

const ENGINE_ID = 'clawtext-session-intelligence';
const ROUTER_KEY = `${ENGINE_ID}::router`;

// Module-level registry so tool factories and hooks can access recall methods after engine creation.
// Registry keys are absolute workspace paths for concrete engines plus ROUTER_KEY for the workspace-aware router.
type SIEngineWithRecall = ReturnType<typeof createSessionIntelligenceEngine>;
const _siEngineRegistry = new Map<string, SIEngineWithRecall>();

type ContextEngineRegistrationApi = {
  registerContextEngine: (id: string, factory: () => unknown) => void;
};

function normalizeWorkspacePath(workspacePath: string): string {
  return path.resolve(workspacePath);
}

function resolveWorkspacePathForSession(config: SessionIntelligenceConfig, sessionId: string): string {
  const resolved = typeof config.workspaceResolver === 'function'
    ? config.workspaceResolver(sessionId)
    : config.workspacePath;
  return normalizeWorkspacePath(resolved || config.workspacePath);
}

function getOrCreateWorkspaceEngine(
  config: SessionIntelligenceConfig,
  workspacePath: string,
): SIEngineWithRecall {
  const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
  const existing = _siEngineRegistry.get(normalizedWorkspacePath);
  // Evict disposed instances — dispose() closes the DB handle; reuse would fail
  if (existing) {
    if (typeof (existing as unknown as { isDisposed?: () => boolean }).isDisposed === 'function' &&
        (existing as unknown as { isDisposed: () => boolean }).isDisposed()) {
      _siEngineRegistry.delete(normalizedWorkspacePath);
    } else {
      return existing;
    }
  }

  const libraryEntriesDir = path.join(
    normalizedWorkspacePath,
    'state',
    'clawtext',
    'prod',
    'library',
    'entries',
  );

  const engine = createSessionIntelligenceEngine({
    ...config,
    workspacePath: normalizedWorkspacePath,
    libraryEntriesDir,
  });
  _siEngineRegistry.set(normalizedWorkspacePath, engine);
  return engine;
}

export function getRegisteredSIEngine(workspacePath?: string): SIEngineWithRecall | undefined {
  if (workspacePath && workspacePath.trim().length > 0) {
    return _siEngineRegistry.get(normalizeWorkspacePath(workspacePath));
  }

  return _siEngineRegistry.get(ROUTER_KEY) ?? _siEngineRegistry.get(normalizeWorkspacePath(process.cwd()));
}

export function registerSessionIntelligenceEngine(
  api: ContextEngineRegistrationApi,
  config: SessionIntelligenceConfig,
): void {
  api.registerContextEngine(
    ENGINE_ID,
    () => {
      const router: SIEngineWithRecall = {
        info: {
          id: ENGINE_ID,
          name: 'ClawText Session Intelligence',
          version: '0.4.0-walk4',
          ownsCompaction: true,
        },
        bootstrap: (params) => getOrCreateWorkspaceEngine(
          config,
          resolveWorkspacePathForSession(config, params.sessionId),
        ).bootstrap(params),
        ingest: (params) => getOrCreateWorkspaceEngine(
          config,
          resolveWorkspacePathForSession(config, params.sessionId),
        ).ingest(params),
        ingestBatch: (params) => getOrCreateWorkspaceEngine(
          config,
          resolveWorkspacePathForSession(config, params.sessionId),
        ).ingestBatch(params),
        assemble: (params) => getOrCreateWorkspaceEngine(
          config,
          resolveWorkspacePathForSession(config, params.sessionId),
        ).assemble(params),
        compact: (params) => getOrCreateWorkspaceEngine(
          config,
          resolveWorkspacePathForSession(config, params.sessionId),
        ).compact(params),
        afterTurn: (params) => getOrCreateWorkspaceEngine(
          config,
          resolveWorkspacePathForSession(config, params.sessionId),
        ).afterTurn(params),
        prepareSubagentSpawn: (params) => getOrCreateWorkspaceEngine(
          config,
          resolveWorkspacePathForSession(config, params.parentSessionKey),
        ).prepareSubagentSpawn(params),
        onSubagentEnded: (params) => getOrCreateWorkspaceEngine(
          config,
          resolveWorkspacePathForSession(config, params.childSessionKey),
        ).onSubagentEnded(params),
        dispose: async () => {
          const entries = [..._siEngineRegistry.entries()]
            .filter(([key]) => key !== ROUTER_KEY);
          await Promise.all(entries.map(([, engine]) => engine.dispose()));
          // Clear disposed workspace engines from the registry so subsequent
          // getOrCreateWorkspaceEngine calls recreate fresh instances with open DBs.
          for (const [key] of entries) {
            _siEngineRegistry.delete(key);
          }
        },
        _recall: {
          search(sessionId, query, limit, types) {
            return getOrCreateWorkspaceEngine(
              config,
              resolveWorkspacePathForSession(config, sessionId),
            )._recall.search(sessionId, query, limit, types);
          },
          describe(sessionId, id) {
            return getOrCreateWorkspaceEngine(
              config,
              resolveWorkspacePathForSession(config, sessionId),
            )._recall.describe(sessionId, id);
          },
          expand(sessionId, targetId) {
            return getOrCreateWorkspaceEngine(
              config,
              resolveWorkspacePathForSession(config, sessionId),
            )._recall.expand(sessionId, targetId);
          },
        },
      } as SIEngineWithRecall;

      _siEngineRegistry.set(ROUTER_KEY, router);
      getOrCreateWorkspaceEngine(config, config.workspacePath);
      return router;
    },
  );
}

export { createSessionIntelligenceEngine };
export { loadAcaFiles, buildKernelContent, buildOverlayContent } from './aca';
export { upsertStateSlot, getStateSlot, getAllStateSlots, kernelSlotsPresent } from './state-slots';
export {
  classifyMessage,
  extractDecisionText,
  extractProblemText,
  CONTENT_TYPE_PRIORITY,
  CONTENT_TYPE_COMPACTION_ORDER,
} from './content-type';
export { extractStateFromMessage } from './state-extraction';
export { evaluateTrigger, recordCompactionEvent, resolveTriggerConfig, shouldRunProactivePass } from './trigger';
export { computePressureSignals, buildPressureReading, classifyPressureBand, PRESSURE_THRESHOLDS } from './pressure';
export { runNoiseSweep, runToolDecay } from './proactive-pass';
export { search, describe, expand } from './recall';
export { shouldExternalize, externalizePayload, recoverPayload } from './large-file';
export { insertPayloadRef, getPayloadRef, listPayloadRefs, markPayloadRefExpired } from './payload-store';
export {
  detectCallType,
  insertToolCallMeta,
  markConsumed,
  getDecayEligibleMessages,
  markExternalized,
  detectConsumption,
  DECAY_WINDOWS,
} from './tool-tracker';
export {
  hashContent,
  toFileUri,
  looksLikeFilePath,
  extractFilePath,
  insertResourceVersion,
  getLatestResourceVersion,
  computeDelta,
  processFileRead,
  buildResourceToken,
} from './resource-versions.js';
export type { DeltaType } from './resource-versions.js';
export {
  insertSlotAssociation,
  getSlotAssociations,
  getRecoveryPriority,
  associateResourceWithSlots,
} from './slot-associations.js';
export type { RecoveryPriority, ResourceSlotAssociation } from './slot-associations.js';
export type { SessionIntelligenceConfig };
