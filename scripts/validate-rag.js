#!/usr/bin/env node

/**
 * RAG Validation Tool
 * Tests RAG injection quality by sampling queries and measuring confidence
 * 
 * Usage:
 *   node scripts/validate-rag.js [--verbose] [--output json|text]
 * 
 * Output:
 *   - Memories tested (samples from each cluster)
 *   - Avg confidence scores
 *   - Injection tuning recommendations
 *   - Problem diagnosis
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAG_PATH = path.join(__dirname, '../src/rag.js');
const WORKSPACE_PATH = path.join(__dirname, '../../..');

// Sample queries for each major project/topic
const SAMPLE_QUERIES = [
  // MoltMUD queries
  { query: 'MoltMUD ZORTHAK registration flow', project: 'moltmud', expect_count: 3 },
  { query: 'rest meditate combat regen mechanics', project: 'moltmud', expect_count: 2 },
  { query: 'bridge docker deployment agent', project: 'moltmud', expect_count: 2 },
  
  // OpenClaw queries
  { query: 'gateway restart protocol confirmation', project: 'openclaw', expect_count: 2 },
  { query: 'embedding ollama configuration', project: 'openclaw', expect_count: 2 },
  { query: 'context window compaction safeguard', project: 'openclaw', expect_count: 1 },
  
  // Memory system queries
  { query: 'YAML headers clustering RAG injection', project: 'memory-system', expect_count: 2 },
  { query: 'deduplication SHA1 hashing idempotency', project: 'clawtext', expect_count: 2 },
  { query: 'agent onboarding cluster rebuild automation', project: 'memory-system', expect_count: 2 },
];

async function loadRAG() {
  try {
    const { ClawTextRAG } = await import(RAG_PATH);
    return new ClawTextRAG(WORKSPACE_PATH);
  } catch (err) {
    console.error('❌ Failed to load RAG engine:', err.message);
    process.exit(1);
  }
}

function formatResults(results, format = 'text') {
  if (format === 'json') {
    return JSON.stringify(results, null, 2);
  }

  // Text format
  let output = '\n📊 RAG VALIDATION REPORT\n';
  output += '═'.repeat(60) + '\n\n';

  // Summary stats
  const totalQueries = results.queries.length;
  const avgConfidence = (results.stats.totalConfidence / totalQueries).toFixed(3);
  const avgMemories = (results.stats.totalMemories / totalQueries).toFixed(1);
  const qualityPass = results.stats.qualityScore >= 0.75;

  output += `📈 SUMMARY\n`;
  output += `├─ Queries tested: ${totalQueries}\n`;
  output += `├─ Avg confidence: ${avgConfidence} ${getConfidenceMeter(avgConfidence)}\n`;
  output += `├─ Avg memories per query: ${avgMemories}\n`;
  output += `├─ Overall quality: ${(results.stats.qualityScore * 100).toFixed(0)}% ${qualityPass ? '✅' : '⚠️'}\n`;
  output += `└─ Token usage: ${results.stats.totalTokens} tokens (${((results.stats.totalTokens / 4000) * 100).toFixed(1)}% of budget)\n\n`;

  // Per-query breakdown
  output += `📋 QUERY RESULTS\n`;
  results.queries.forEach((q, i) => {
    const icon = q.confidence >= 0.70 ? '✅' : q.confidence >= 0.50 ? '⚠️' : '❌';
    output += `${i + 1}. ${icon} "${q.query}"\n`;
    output += `   ├─ Confidence: ${q.confidence.toFixed(3)}\n`;
    output += `   ├─ Memories: ${q.memories.length} (expected ~${q.expect_count})\n`;
    output += `   ├─ Tokens: ${q.tokens}\n`;
    if (q.memories.length > 0) {
      output += `   └─ Top memory: "${q.memories[0].content.substring(0, 50)}..."\n`;
    } else {
      output += `   └─ ⚠️  No memories returned\n`;
    }
  });

  // Recommendations
  output += `\n💡 RECOMMENDATIONS\n`;
  results.recommendations.forEach(rec => {
    output += `├─ ${rec}\n`;
  });

  output += '\n' + '═'.repeat(60) + '\n';
  return output;
}

function getConfidenceMeter(conf) {
  const score = parseFloat(conf);
  if (score >= 0.85) return '[████████] excellent';
  if (score >= 0.70) return '[██████░░] good';
  if (score >= 0.50) return '[████░░░░] fair';
  return '[██░░░░░░] poor';
}

async function generateRecommendations(stats) {
  const recs = [];

  if (stats.qualityScore < 0.70) {
    recs.push('Quality below 70% - consider rebuilding clusters or increasing minConfidence');
  }

  if (stats.avgConfidence < 0.50) {
    recs.push('Low confidence scores - memories may need YAML headers or clusters are stale');
  }

  if (stats.avgMemories < 3) {
    recs.push('Few memories returned - increase maxMemories or check if clusters are missing');
  }

  if (stats.avgMemories > 8) {
    recs.push('Many memories returned - consider increasing minConfidence to filter noise');
  }

  if (stats.totalTokens > 3500) {
    recs.push('High token usage - reduce maxMemories or tokenBudget if needed');
  }

  if (recs.length === 0) {
    recs.push('✅ RAG system is well-tuned - no changes recommended');
  }

  return recs;
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const format = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'text';

  console.log('🧪 RAG Validation: Loading RAG engine...');
  const rag = await loadRAG();

  console.log(`✅ RAG loaded. Testing ${SAMPLE_QUERIES.length} sample queries...\n`);

  const queryResults = [];
  let totalConfidence = 0;
  let totalMemories = 0;
  let totalTokens = 0;

  for (const sample of SAMPLE_QUERIES) {
    try {
      const result = rag.findRelevantMemories(sample.query);
      
      if (!result || !Array.isArray(result)) {
        console.error(`✗ Query failed: "${sample.query}" (invalid result)`);
        continue;
      }

      const confidence = result.length > 0 
        ? result.reduce((sum, m) => sum + (m.confidence || 0), 0) / result.length
        : 0;

      queryResults.push({
        query: sample.query,
        confidence,
        memories: result.slice(0, 3),
        tokens: Math.ceil(result.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4),
        expect_count: sample.expect_count
      });

      totalConfidence += confidence;
      totalMemories += result.length;
      totalTokens += Math.ceil(result.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4);

      if (verbose) {
        console.log(`✓ "${sample.query}"`);
        console.log(`  └─ ${result.length} memories, conf=${confidence.toFixed(3)}\n`);
      }
    } catch (err) {
      console.error(`✗ Query failed: "${sample.query}"`);
      console.error(`  Error: ${err.message}\n`);
    }
  }

  const avgConfidence = totalConfidence / SAMPLE_QUERIES.length;
  const avgMemories = totalMemories / SAMPLE_QUERIES.length;
  const qualityScore = Math.min(
    (avgConfidence / 0.85),  // Confidence target: 0.85
    (Math.min(avgMemories, 7) / 7)  // Memory target: 7
  );

  const recommendations = await generateRecommendations({
    qualityScore: Math.min(qualityScore, 1),
    avgConfidence,
    avgMemories,
    totalTokens
  });

  const results = {
    timestamp: new Date().toISOString(),
    queries: queryResults,
    stats: {
      queriesTested: SAMPLE_QUERIES.length,
      totalConfidence,
      totalMemories,
      totalTokens,
      avgConfidence,
      avgMemories,
      qualityScore: Math.min(qualityScore, 1)
    },
    recommendations
  };

  console.log(formatResults(results, format));
  process.exit(qualityScore >= 0.70 ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
