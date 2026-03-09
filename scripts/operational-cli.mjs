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
 * - operational:aggregation:stats - Show aggregation statistics
 * - operational:synthesize - Synthesize all candidates (improve quality)
 * - operational:merge:find - Find duplicate patterns
 * - operational:merge <primary> <duplicate> - Merge two patterns
 * - operational:correlate <patternKey> - Find correlated patterns
 * - operational:report - Full aggregation report
 */

import { OperationalMemoryManager } from '../dist/operational.js';
import { OperationalCaptureManager } from '../dist/operational-capture.js';
import { OperationalAggregationManager } from '../dist/operational-aggregation.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspacePath = process.env.HOME + '/.openclaw/workspace';

const memoryManager = new OperationalMemoryManager(workspacePath);
const captureManager = new OperationalCaptureManager(workspacePath);
const aggregationManager = new OperationalAggregationManager(workspacePath);

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
    captureErrorInteractive();
    break;
  case 'capture:success':
    captureSuccessInteractive();
    break;
  case 'transfer-check':
    if (!args[1]) {
      console.error('Usage: npm run operational:transfer-check -- <task>');
      process.exit(1);
    }
    transferCheck(args.slice(1).join(' '));
    break;
  case 'aggregation:stats':
    showAggregationStats();
    break;
  case 'synthesize':
    synthesizeAll();
    break;
  case 'merge:find':
    findDuplicatePatterns();
    break;
  case 'merge':
    if (!args[1] || !args[2]) {
      console.error('Usage: npm run operational:merge -- <primary> <duplicate>');
      process.exit(1);
    }
    mergePatterns(args[1], args[2]);
    break;
  case 'correlate':
    if (!args[1]) {
      console.error('Usage: npm run operational:correlate -- <patternKey>');
      process.exit(1);
    }
    correlatePatterns(args[1]);
    break;
  case 'report':
    generateReport();
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
  operational:capture:error       Interactively capture an error pattern
  operational:capture:success     Interactively capture a success pattern
  operational:transfer-check <task> Check for relevant patterns before a task
  operational:aggregation:stats   Show aggregation statistics
  operational:synthesize          Synthesize all candidates (improve quality)
  operational:merge:find          Find duplicate patterns
  operational:merge <primary> <duplicate> Merge two patterns
  operational:correlate <patternKey> Find correlated patterns
  operational:report              Full aggregation report

Examples:
  npm run operational:status
  npm run operational:review
  npm run operational:search -- "compaction failure"
  npm run operational:promote -- "tool.exec.invalid_workdir"
  npm run operational:synthesize
  npm run operational:merge:find
  npm run operational:merge -- "pattern1" "pattern2"
  npm run operational:correlate -- "pattern1"
  npm run operational:report
`);
}

function showStatus() {
  const stats = memoryManager.getStats();

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

function showAggregationStats() {
  const stats = captureManager.getAggregationStats();

  console.log(`
📈 Operational Memory Aggregation Stats
========================================

Total unique signatures: ${stats.totalSignatures}
Patterns with recurrence: ${stats.patternsWithRecurrence}
Candidates awaiting review: ${stats.candidates}

Note: Patterns are auto-promoted to candidate status when they repeat (≥2 occurrences).
`);
}

function showReviewQueue() {
  const candidates = memoryManager.getReviewQueue();

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
  console.log('  - Run "npm run operational:synthesize" to auto-improve quality');
  console.log('  - Run "npm run operational:merge:find" to find duplicates');
  console.log('');
}

function searchMemories(query) {
  const results = memoryManager.search(query, { limit: 20 });

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
  const entry = memoryManager.get(patternKey);
  if (!entry) {
    console.error(`Pattern not found: ${patternKey}`);
    process.exit(1);
  }

  if (entry.status === 'promoted') {
    console.log(`Pattern already promoted: ${patternKey}`);
    return;
  }

  const target = promptForTarget(entry);
  if (!target) {
    console.log('Promotion cancelled.');
    return;
  }

  const updated = memoryManager.promote(patternKey, target);
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
  
  const scopeToTarget = {
    'tool': 'TOOLS.md',
    'agent': 'AGENTS.md',
    'gateway': 'AGENTS.md',
    'project': 'project docs',
    'global': 'SOUL.md',
  };
  
  return scopeToTarget[entry.scope] || 'SOUL.md';
}

function captureErrorInteractive() {
  console.log(`
📝 Interactive Error Pattern Capture
=====================================

This will guide you through capturing an error pattern.

Step 1: Basic Information
--------------------------
`);

  const entry = captureManager.capture({
    type: 'error-pattern',
    summary: 'Interactive error capture (placeholder)',
    symptom: 'TBD - Use programmatic capture or edit manually',
    trigger: 'TBD',
    rootCause: 'TBD',
    fix: 'TBD',
    scope: 'global',
    evidence: ['Interactive capture placeholder'],
    timestamp: new Date().toISOString(),
  });

  console.log(`
✅ Created error pattern: ${entry.patternKey}
   Status: ${entry.status}
   
Next steps:
  - Edit the YAML file to add details
  - Or use programmatic capture from hooks/wrappers
  - Run "npm run operational:review" to see it in the queue
`);
}

function captureSuccessInteractive() {
  console.log(`
📝 Interactive Success Pattern Capture
======================================

This will guide you through capturing a success pattern.

Step 1: Basic Information
--------------------------
`);

  const entry = captureManager.capture({
    type: 'success-pattern',
    summary: 'Interactive success capture (placeholder)',
    symptom: 'Workflow completed successfully',
    trigger: 'TBD',
    rootCause: 'TBD',
    fix: 'Follow this approach',
    scope: 'global',
    evidence: ['Interactive capture placeholder'],
    timestamp: new Date().toISOString(),
  });

  console.log(`
✅ Created success pattern: ${entry.patternKey}
   Status: ${entry.status}
   
Next steps:
  - Edit the YAML file to add details
  - Or use programmatic capture from hooks/wrappers
  - Run "npm run operational:review" to see it in the queue
`);
}

function transferCheck(task) {
  console.log(`
🔍 Transfer Check - "${task}"
==============================

Checking for relevant operational patterns before this task...

`);

  const relevantPatterns = memoryManager.search(task, { 
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

function synthesizeAll() {
  console.log('🔄 Synthesizing all candidates...\n');

  const results = aggregationManager.synthesizeAll();
  
  if (results.length === 0) {
    console.log('✅ No candidates to synthesize.');
    return;
  }

  let improved = 0;
  results.forEach(result => {
    if (result.improved) {
      improved++;
      console.log(`✅ ${result.patternKey}`);
      result.changes.forEach(change => console.log(`   ${change}`));
    } else {
      console.log(`- ${result.patternKey} (no changes needed)`);
    }
  });

  console.log(`\n✅ Synthesis complete: ${improved} patterns improved.`);
}

function findDuplicatePatterns() {
  console.log('🔍 Finding duplicate patterns...\n');

  const suggestions = aggregationManager.findDuplicatePatterns();
  
  if (suggestions.length === 0) {
    console.log('✅ No duplicate patterns found.');
    return;
  }

  console.log(`Found ${suggestions.length} potential duplicates:\n`);

  suggestions.forEach((suggestion, i) => {
    console.log(`${i + 1}. ${suggestion.primaryPatternKey} ← ${suggestion.duplicatePatternKey}`);
    console.log(`   Reason: ${suggestion.reason}`);
    console.log(`   Confidence: ${(suggestion.confidence * 100).toFixed(0)}%`);
    console.log('');
  });

  console.log('To merge: npm run operational:merge -- <primary> <duplicate>');
}

function mergePatterns(primaryKey, duplicateKey) {
  const primary = memoryManager.get(primaryKey);
  const duplicate = memoryManager.get(duplicateKey);

  if (!primary) {
    console.error(`Primary pattern not found: ${primaryKey}`);
    process.exit(1);
  }

  if (!duplicate) {
    console.error(`Duplicate pattern not found: ${duplicateKey}`);
    process.exit(1);
  }

  console.log(`Merging ${duplicateKey} into ${primaryKey}...`);
  console.log(`  Primary recurrence: ${primary.recurrenceCount}`);
  console.log(`  Duplicate recurrence: ${duplicate.recurrenceCount}`);

  const merged = aggregationManager.mergePatterns(primaryKey, duplicateKey);
  
  if (merged) {
    console.log(`\n✅ Merge complete!`);
    console.log(`   New recurrence: ${merged.recurrenceCount}`);
    console.log(`   Evidence items: ${merged.evidence.length}`);
    console.log(`   Duplicate archived.`);
  }
}

function correlatePatterns(patternKey) {
  console.log(`🔗 Finding correlations for ${patternKey}...\n`);

  const correlations = aggregationManager.findCorrelatedPatterns(patternKey);
  
  if (correlations.length === 0) {
    console.log('✅ No correlated patterns found.');
    return;
  }

  console.log(`Found ${correlations.length} correlations:\n`);

  correlations.forEach((corr, i) => {
    console.log(`${i + 1}. ${corr.patternKey1} ${corr.correlationType} ${corr.patternKey2}`);
    console.log(`   Confidence: ${(corr.confidence * 100).toFixed(0)}%`);
    console.log(`   ${corr.explanation}`);
    console.log('');
  });
}

function generateReport() {
  console.log('📊 Operational Memory Aggregation Report\n');
  console.log('='.repeat(60));
  console.log('');

  const report = aggregationManager.getAggregationReport();

  console.log(`Total candidates: ${report.totalCandidates}`);
  console.log(`Synthesized: ${report.synthesized.length} patterns`);
  console.log(`Merge suggestions: ${report.mergeSuggestions.length}`);
  console.log(`High recurrence patterns (≥3): ${report.highRecurrencePatterns.length}`);
  console.log(`Patterns needing review: ${report.patternsNeedingReview.length}`);
  console.log('');

  if (report.patternsNeedingReview.length > 0) {
    console.log('⚠️  Patterns needing review:');
    report.patternsNeedingReview.forEach(p => {
      const issues = [];
      if (p.rootCause === 'TBD') issues.push('rootCause=TBD');
      if (p.fix === 'TBD') issues.push('fix=TBD');
      if (p.recurrenceCount >= 5 && p.confidence < 0.7) issues.push('low confidence');
      console.log(`   - ${p.patternKey}: ${issues.join(', ')}`);
    });
    console.log('');
  }

  if (report.mergeSuggestions.length > 0) {
    console.log('🔀 Merge suggestions:');
    report.mergeSuggestions.forEach(s => {
      console.log(`   - ${s.primaryPatternKey} ← ${s.duplicatePatternKey} (${(s.confidence * 100).toFixed(0)}%)`);
    });
    console.log('');
  }

  console.log('='.repeat(60));
  console.log('Run "npm run operational:synthesize" to auto-improve candidates');
  console.log('Run "npm run operational:merge:find" to find duplicates');
}

// Export for programmatic use
export { memoryManager, captureManager, aggregationManager };
