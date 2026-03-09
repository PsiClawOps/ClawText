#!/usr/bin/env node

/**
 * ClawText Operational Memory CLI
 * 
 * Commands:
 * - operational:status - Show operational memory statistics
 * - operational:review - Show review queue (candidates awaiting review)
 * - operational:search <query> - Search operational memories
 * - operational:promote <patternKey> - Promote pattern to workspace
 * - operational:capture:error - Manually capture an error pattern
 * - operational:capture:success - Manually capture a success pattern
 * - operational:transfer-check <task> - Check for relevant operational patterns before a task
 */

import { OperationalMemoryManager } from '../dist/operational.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspacePath = process.env.HOME + '/.openclaw/workspace';

const manager = new OperationalMemoryManager(workspacePath);

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  printUsage();
  process.exit(1);
}

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'review':
    showReviewQueue();
    break;
  case 'search':
    if (!args[1]) {
      console.error('Usage: npm run operational:search -- <query>');
      process.exit(1);
    }
    searchMemories(args.slice(1).join(' '));
    break;
  case 'promote':
    if (!args[1]) {
      console.error('Usage: npm run operational:promote -- <patternKey>');
      process.exit(1);
    }
    promotePattern(args[1]);
    break;
  case 'capture:error':
    captureError();
    break;
  case 'capture:success':
    captureSuccess();
    break;
  case 'transfer-check':
    if (!args[1]) {
      console.error('Usage: npm run operational:transfer-check -- <task>');
      process.exit(1);
    }
    transferCheck(args.slice(1).join(' '));
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}

function printUsage() {
  console.log(`
ClawText Operational Memory CLI

Usage: npm run operational:<command> [args]

Commands:
  operational:status              Show operational memory statistics
  operational:review              Show review queue (candidates awaiting review)
  operational:search <query>      Search operational memories
  operational:promote <patternKey> Promote pattern to workspace guidance
  operational:capture:error       Manually capture an error pattern
  operational:capture:success     Manually capture a success pattern
  operational:transfer-check <task> Check for relevant patterns before a task

Examples:
  npm run operational:status
  npm run operational:review
  npm run operational:search -- "compaction failure"
  npm run operational:promote -- "tool.exec.invalid_workdir"
  npm run operational:transfer-check -- "deploying gateway config"
`);
}

function showStatus() {
  const stats = manager.getStats();

  console.log(`
📊 ClawText Operational Memory Status
======================================

Total patterns: ${stats.total}

By Status:
  Raw:          ${stats.byStatus.raw}
  Candidate:    ${stats.byStatus.candidate}
  Reviewed:     ${stats.byStatus.reviewed}
  Promoted:     ${stats.byStatus.promoted}
  Archived:     ${stats.byStatus.archived}

By Type:
  Error patterns:     ${stats.byType['error-pattern']}
  Anti-patterns:      ${stats.byType['anti-pattern']}
  Recovery patterns:  ${stats.byType['recovery-pattern']}
  Success patterns:   ${stats.byType['success-pattern']}
  Optimizations:      ${stats.byType['optimization']}
  Capability gaps:    ${stats.byType['capability-gap']}

By Scope:
  Tool:    ${stats.byScope.tool}
  Agent:   ${stats.byScope.agent}
  Project: ${stats.byScope.project}
  Gateway: ${stats.byScope.gateway}
  Global:  ${stats.byScope.global}

High recurrence (≥3): ${stats.highRecurrence}
`);
}

function showReviewQueue() {
  const candidates = manager.getReviewQueue();

  if (candidates.length === 0) {
    console.log('✅ Review queue is empty. No candidates awaiting review.');
    return;
  }

  console.log(`
🔍 Review Queue - ${candidates.length} candidates awaiting review
================================================================

`);

  candidates.forEach((candidate, i) => {
    console.log(`${i + 1}. [${candidate.patternKey}]`);
    console.log(`   Type: ${candidate.type} | Scope: ${candidate.scope} | Recurrence: ${candidate.recurrenceCount}`);
    console.log(`   Summary: ${candidate.summary}`);
    console.log(`   Symptom: ${candidate.symptom}`);
    console.log(`   Root cause: ${candidate.rootCause}`);
    console.log(`   Proposed fix: ${candidate.fix}`);
    console.log(`   Confidence: ${(candidate.confidence * 100).toFixed(0)}%`);
    console.log(`   Last seen: ${candidate.lastSeenAt}`);
    console.log(`   Evidence: ${candidate.evidence.length} items`);
    console.log('');
  });

  console.log('Actions:');
  console.log('  - Review each candidate and decide: approve, reject, or merge');
  console.log('  - Use: npm run operational:promote -- <patternKey>');
  console.log('');
}

function searchMemories(query) {
  const results = manager.search(query, { limit: 20 });

  if (results.length === 0) {
    console.log(`No operational memories found matching: "${query}"`);
    return;
  }

  console.log(`
🔎 Search Results - ${results.length} matches for "${query}"
============================================================

`);

  results.forEach((entry, i) => {
    const statusEmoji = {
      'raw': '📄',
      'candidate': '⏳',
      'reviewed': '✅',
      'promoted': '🌟',
      'archived': '🗄️',
    };

    console.log(`${i + 1}. ${statusEmoji[entry.status]} [${entry.patternKey}]`);
    console.log(`   Type: ${entry.type} | Scope: ${entry.scope} | Recurrence: ${entry.recurrenceCount}`);
    console.log(`   Summary: ${entry.summary}`);
    if (entry.recurrenceCount >= 3) {
      console.log(`   ⚠️  High recurrence pattern`);
    }
    console.log('');
  });

  console.log('Use "npm run operational:search -- <query> --details" for full details.');
}

function promotePattern(patternKey) {
  const entry = manager.get(patternKey);
  if (!entry) {
    console.error(`Pattern not found: ${patternKey}`);
    process.exit(1);
  }

  if (entry.status === 'promoted') {
    console.log(`Pattern already promoted: ${patternKey}`);
    return;
  }

  // Ask for target
  const target = promptForTarget(entry);
  if (!target) {
    console.log('Promotion cancelled.');
    return;
  }

  const updated = manager.promote(patternKey, target);
  if (updated) {
    console.log(`✅ Pattern promoted: ${patternKey}`);
    console.log(`   Target: ${target}`);
    console.log(`   Promoted at: ${updated.promotedAt}`);
  }
}

function promptForTarget(entry) {
  console.log('\nWhere should this pattern be promoted?');
  console.log('1. SOUL.md (behavioral pattern)');
  console.log('2. TOOLS.md (tool gotcha)');
  console.log('3. AGENTS.md (workflow pattern)');
  console.log('4. Project docs (project-specific rule)');
  console.log('5. ClawText docs (general memory lesson)');
  console.log('');
  
  // For now, just use a default based on scope
  const scopeToTarget = {
    'tool': 'TOOLS.md',
    'agent': 'AGENTS.md',
    'gateway': 'AGENTS.md',
    'project': 'project docs',
    'global': 'SOUL.md',
  };
  
  return scopeToTarget[entry.scope] || 'SOUL.md';
}

function captureError() {
  console.log(`
📝 Manual Error Pattern Capture
================================

Please provide the following information:

1. Summary (one-line description):
2. Symptom (what you see):
3. Trigger (what causes it):
4. Root cause (why it happens):
5. Fix (how to resolve/avoid):
6. Scope (tool/agent/project/gateway/global):
7. Evidence (optional, comma-separated):

For now, this is a placeholder. Full interactive capture coming in v1.5.
`);

  // Create a minimal entry for now
  const entry = manager.create({
    type: 'error-pattern',
    status: 'raw',
    summary: 'Manual capture placeholder',
    symptom: 'TBD',
    trigger: 'TBD',
    rootCause: 'TBD',
    fix: 'TBD',
    scope: 'global',
    confidence: 0.5,
    recurrenceCount: 1,
    evidence: [],
  });

  console.log(`\n✅ Created raw entry: ${entry.patternKey}`);
  console.log(`   Run "npm run operational:review" to see it in the raw queue.`);
}

function captureSuccess() {
  console.log(`
📝 Manual Success Pattern Capture
==================================

Please provide the following information:

1. Summary (one-line description):
2. What worked:
3. Context (when/where it worked):
4. Why it worked:
5. Scope (tool/agent/project/gateway/global):
6. Evidence (optional, comma-separated):

For now, this is a placeholder. Full interactive capture coming in v1.5.
`);

  const entry = manager.create({
    type: 'success-pattern',
    status: 'raw',
    summary: 'Manual success capture placeholder',
    symptom: 'Workflow completed successfully',
    trigger: 'TBD',
    rootCause: 'TBD',
    fix: 'Follow this approach',
    scope: 'global',
    confidence: 0.7,
    recurrenceCount: 1,
    evidence: [],
  });

  console.log(`\n✅ Created raw entry: ${entry.patternKey}`);
  console.log(`   Run "npm run operational:review" to see it in the raw queue.`);
}

function transferCheck(task) {
  console.log(`
🔍 Transfer Check - "${task}"
==============================

Checking for relevant operational patterns before this task...

`);

  // Search for patterns related to the task
  const relevantPatterns = manager.search(task, { 
    status: 'reviewed',
    limit: 10
  });

  if (relevantPatterns.length === 0) {
    console.log('✅ No relevant operational patterns found.');
    console.log('   Proceed with confidence.');
    return;
  }

  console.log(`⚠️  Found ${relevantPatterns.length} relevant patterns to consider:\n`);

  relevantPatterns.forEach((pattern, i) => {
    console.log(`${i + 1}. [${pattern.patternKey}]`);
    console.log(`   Type: ${pattern.type} | Recurrence: ${pattern.recurrenceCount}`);
    console.log(`   Summary: ${pattern.summary}`);
    console.log(`   Fix: ${pattern.fix}`);
    console.log('');
  });

  console.log('Consider these patterns before proceeding.');
}
