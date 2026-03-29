/**
 * Agent Identity Module
 * 
 * Handles agent identity propagation for multi-agent deployments.
 * Part of Phase 1: Identity Propagation (Gore's Decoherence Hardening Brief)
 * 
 * References:
 * - docs/AGENT_TIER_ARCHITECTURE.md
 * - docs/AGENT_TIER_ARCHITECTURE.md (Gore's brief)
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';

export interface AgentIdentity {
  agentId: string;
  agentRole: 'council' | 'director' | 'worker';
  agentName: string;
  workspacePath: string;
}

export interface ClawTextMultiAgentConfig {
  enabled: boolean;
  defaultVisibility: 'private' | 'shared' | 'council';
  agentIdentity?: AgentIdentity;
}

const DEFAULT_MULTI_AGENT_CONFIG: ClawTextMultiAgentConfig = {
  enabled: false,
  defaultVisibility: 'shared',
};

/**
 * Resolve agent role from IDENTITY.md in the workspace.
 * Reads the **Role:** line and maps it to council/director/worker.
 * Falls back to path-based heuristic if IDENTITY.md is absent.
 */
function resolveRoleFromIdentityFile(workspacePath: string): 'council' | 'director' | 'worker' | null {
  const identityPath = join(workspacePath, 'IDENTITY.md');
  if (!existsSync(identityPath)) return null;
  try {
    const lines = readFileSync(identityPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*-\s*\*\*Role:\*\*\s*(.+)/i);
      if (match) {
        const roleText = match[1].toLowerCase();
        if (roleText.includes('council')) return 'council';
        if (roleText.includes('director')) return 'director';
        return 'worker';
      }
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Resolve agent identity from workspace path or config.
 * 
 * Priority:
 * 1. Explicit config (clawtext.multiAgent.agentIdentity)
 * 2. IDENTITY.md in workspace (reads Name + Role)
 * 3. Workspace path derivation (workspace-council/{agent} → council role)
 * 4. Fallback to 'default'
 */
export function resolveAgentIdentity(workspacePath: string, config?: ClawTextMultiAgentConfig): AgentIdentity {
  // Priority 1: Explicit config
  if (config?.agentIdentity) {
    return config.agentIdentity;
  }

  // Priority 2: Derive from workspace path structure
  // E.g., /home/.../workspace-council/gore-antagonist → council role, agent "gore-antagonist"
  // Works for any council seat: gore-antagonist, sentinel-security, compass-vision, etc.
  
  const pathParts = workspacePath.split('/');
  const councilIndex = pathParts.indexOf('workspace-council');
  
  if (councilIndex !== -1 && councilIndex < pathParts.length - 1) {
    const agentDir = pathParts[councilIndex + 1]; // e.g., "forge", "pylon", "chisel"
    // Read actual role from IDENTITY.md — don't assume council just because of parent dir
    const role = resolveRoleFromIdentityFile(workspacePath) ?? 'council';
    return {
      agentId: agentDir,
      agentRole: role,
      agentName: agentDir,
      workspacePath,
    };
  }

  // Also check for workspace-director pattern
  const directorIndex = pathParts.indexOf('workspace-director');
  if (directorIndex !== -1 && directorIndex < pathParts.length - 1) {
    const agentDir = pathParts[directorIndex + 1];
    return {
      agentId: agentDir,
      agentRole: 'director',
      agentName: agentDir,
      workspacePath,
    };
  }

  // Priority 3: Fallback
  return {
    agentId: 'default',
    agentRole: 'worker',
    agentName: 'default',
    workspacePath,
  };
}

/**
 * Load multi-agent config from openclaw.json or environment variables
 * 
 * Uses a walk-up approach to find the config file, starting from the workspace directory.
 * Falls back to ~/.openclaw/openclaw.json as the canonical location.
 * Also checks environment variables for activation.
 */
export function loadMultiAgentConfig(workspacePath: string): ClawTextMultiAgentConfig {
  // Check env vars first (explicit override)
  const envEnabled = process.env.CLAWTEXT_MULTIAGENT_ENABLED;
  const envVisibility = process.env.CLAWTEXT_DEFAULT_VISIBILITY;
  const envAgentId = process.env.CLAWTEXT_AGENT_ID;
  const envAgentRole = process.env.CLAWTEXT_AGENT_ROLE;
  const envAgentName = process.env.CLAWTEXT_AGENT_NAME;
  
  if (envEnabled === 'true') {
    const config: ClawTextMultiAgentConfig = {
      enabled: true,
      defaultVisibility: (envVisibility as any) || 'private',
    };
    
    // Only use env var identity when workspace matches the default (env var owner's session).
    // For non-default workspaces (other agents), skip env identity — let workspace path
    // derivation in resolveAgentIdentity() determine the correct agent.
    // This prevents the gateway's env vars from bleeding one agent's identity into all agents.
    const defaultWorkspace = join(process.env.HOME || '', '.openclaw', 'workspace');
    const isDefaultWorkspace = !workspacePath || workspacePath === defaultWorkspace;
    
    if (envAgentId && isDefaultWorkspace) {
      config.agentIdentity = {
        agentId: envAgentId,
        agentRole: (envAgentRole as any) || 'worker',
        agentName: envAgentName || envAgentId,
        workspacePath,
      };
    }
    
    return config;
  }

  // Strategy: Walk up from workspace until we find openclaw.json
  // Fall back to canonical ~/.openclaw/openclaw.json
  
  // dirname, join, existsSync, readFileSync all imported at module scope
  
  // Start at workspace, walk up to find config
  let searchPath = workspacePath;
  const maxWalk = 10; // prevent infinite loop
  
  for (let i = 0; i < maxWalk; i++) {
    const configPath = join(searchPath, 'openclaw.json');
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw);
        const clawtext = config?.clawtext || {};
        const multiAgent = clawtext?.multiAgent;
        
        if (!multiAgent) {
          return DEFAULT_MULTI_AGENT_CONFIG;
        }
        
        return {
          enabled: multiAgent.enabled ?? DEFAULT_MULTI_AGENT_CONFIG.enabled,
          defaultVisibility: multiAgent.defaultVisibility ?? DEFAULT_MULTI_AGENT_CONFIG.defaultVisibility,
          agentIdentity: multiAgent.agentIdentity,
        };
      } catch {
        // Corrupted config, fall through
      }
    }
    
    // Move up one directory
    const parent = dirname(searchPath);
    if (parent === searchPath) break; // hit filesystem root
    searchPath = parent;
  }
  
  // Final fallback: canonical location
  const canonicalPath = join(process.env.HOME || '', '.openclaw', 'openclaw.json');
  if (existsSync(canonicalPath)) {
    try {
      const raw = readFileSync(canonicalPath, 'utf-8');
      const config = JSON.parse(raw);
      const clawtext = config?.clawtext || {};
      const multiAgent = clawtext?.multiAgent;
      
      if (!multiAgent) {
        return DEFAULT_MULTI_AGENT_CONFIG;
      }
      
      return {
        enabled: multiAgent.enabled ?? DEFAULT_MULTI_AGENT_CONFIG.enabled,
        defaultVisibility: multiAgent.defaultVisibility ?? DEFAULT_MULTI_AGENT_CONFIG.defaultVisibility,
        agentIdentity: multiAgent.agentIdentity,
      };
    } catch {
      return DEFAULT_MULTI_AGENT_CONFIG;
    }
  }
  
  return DEFAULT_MULTI_AGENT_CONFIG;
}

/**
 * Get the default visibility for memories in multi-agent mode.
 * In council mode, default is 'private' (per Gore's brief).
 * In single-agent mode, default is 'shared'.
 */
export function getDefaultVisibility(config: ClawTextMultiAgentConfig): 'private' | 'shared' | 'council' {
  if (!config.enabled) {
    return 'shared'; // Single-agent mode
  }
  return config.defaultVisibility;
}

/**
 * Determine if we're running in multi-agent mode
 */
export function isMultiAgentMode(workspacePath: string): boolean {
  const config = loadMultiAgentConfig(workspacePath);
  return config.enabled;
}