/**
 * Type-resolution shims for OpenClaw plugin SDK import paths.
 *
 * The runtime package ships declarations under dist/, while plugin code imports
 * from "openclaw/plugin-sdk/<subpath>".
 */

declare module 'openclaw/plugin-sdk/context-engine' {
  export * from 'openclaw/dist/plugin-sdk/context-engine/index.js';
}

declare module 'openclaw/plugin-sdk/agent-runtime' {
  export { resolveAgentIdFromSessionKey } from 'openclaw/dist/plugin-sdk/src/routing/session-key.js';
  export { resolveAgentWorkspaceDir } from 'openclaw/dist/plugin-sdk/src/agents/agent-scope.js';
}
