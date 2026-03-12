#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.resolve(ROOT, '..', '..');

const RAG_QUERIES = [
  'ClawText continuity transfer handoff bootstrap',
  'memory evolution adoption breadcrumbs feature flag',
  'operational pattern retrieval scope isolation',
  'durability classifier promotion confidence',
  'RAG injection token budget relevance curation',
];

const TASK_CONTEXTS = [
  { userMessage: 'debug plugin error and gateway crash logs', currentTask: 'debugging plugin issue' },
  { userMessage: 'run shell command and fix cli tool failure', currentTask: 'command execution fix' },
  { userMessage: 'update gateway config and deploy changes', currentTask: 'config + deploy' },
];

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

function setFlags(flags) {
  process.env.CLAWTEXT_DURABILITY_CLASSIFIER_ENABLED = flags.durability ? 'true' : 'false';
  process.env.CLAWTEXT_SCOPE_ISOLATION_ENABLED = flags.scopeIsolation ? 'true' : 'false';
  process.env.CLAWTEXT_CONTEXT_LIBRARIAN_ENABLED = flags.contextLibrarian ? 'true' : 'false';
}

async function loadModules() {
  // Use runtime RAG path and compiled TS modules for operational lane pieces.
  const ragMod = await import(path.join(ROOT, 'src', 'rag.js'));
  const retrievalMod = await import(path.join(ROOT, 'dist', 'operational-retrieval.js'));
  const promoMod = await import(path.join(ROOT, 'dist', 'operational-promotion.js'));
  const opMod = await import(path.join(ROOT, 'dist', 'operational.js'));
  return {
    ClawTextRAG: ragMod.ClawTextRAG || ragMod.default,
    OperationalRetrievalManager: retrievalMod.OperationalRetrievalManager,
    OperationalPromotionManager: promoMod.OperationalPromotionManager,
    OperationalMemoryManager: opMod.OperationalMemoryManager,
  };
}

async function evaluateScenario(name, flags, modules) {
  setFlags(flags);

  const rag = new modules.ClawTextRAG(WORKSPACE);
  const retrieval = new modules.OperationalRetrievalManager(WORKSPACE);
  const promotion = new modules.OperationalPromotionManager(WORKSPACE);
  const opManager = new modules.OperationalMemoryManager(WORKSPACE);

  // RAG curation/injection metrics
  const ragRows = [];
  let ragInjected = 0;
  let ragTokens = 0;
  for (const q of RAG_QUERIES) {
    const res = rag.injectMemories('SYSTEM', q, ['clawtext', 'memory']);
    ragRows.push({ query: q, injected: res.injected, tokens: res.tokens });
    ragInjected += res.injected;
    ragTokens += res.tokens;
  }

  // Operational retrieval metrics
  const retrievalRows = [];
  for (const ctx of TASK_CONTEXTS) {
    const res = await retrieval.retrieveForTask(ctx, ctx.userMessage);
    retrievalRows.push({
      task: ctx.currentTask,
      type: res.taskType,
      count: res.totalPatterns,
      scopeIsolationEnabled: Boolean(res.scopeIsolationEnabled),
      allowedScopes: res.allowedScopes || [],
    });
  }

  // Promotion proposal sample for durability impact (if any reviewed pattern exists)
  const reviewed = opManager.getAllByStatus('reviewed');
  let promoSample = { skipped: true, reason: 'no reviewed patterns found' };
  if (reviewed.length > 0) {
    const sampleKey = reviewed[0].patternKey;
    const proposal = promotion.getProposal(sampleKey);
    promoSample = proposal
      ? {
          skipped: false,
          patternKey: sampleKey,
          confidence: proposal.confidence,
          rationaleHead: proposal.rationale.slice(0, 3),
        }
      : { skipped: true, reason: `proposal unavailable for ${sampleKey}` };
  }

  return {
    scenario: name,
    flags,
    rag: {
      queryCount: RAG_QUERIES.length,
      totalInjected: ragInjected,
      totalTokens: ragTokens,
      avgInjected: Number((ragInjected / RAG_QUERIES.length).toFixed(2)),
      avgTokens: Number((ragTokens / RAG_QUERIES.length).toFixed(2)),
      rows: ragRows,
    },
    retrieval: {
      contextCount: TASK_CONTEXTS.length,
      rows: retrievalRows,
    },
    promotion: promoSample,
  };
}

function compare(base, variant) {
  return {
    rag: {
      injectedDelta: variant.rag.totalInjected - base.rag.totalInjected,
      tokenDelta: variant.rag.totalTokens - base.rag.totalTokens,
      injectedPct: base.rag.totalInjected > 0
        ? Number((((variant.rag.totalInjected - base.rag.totalInjected) / base.rag.totalInjected) * 100).toFixed(1))
        : null,
      tokenPct: base.rag.totalTokens > 0
        ? Number((((variant.rag.totalTokens - base.rag.totalTokens) / base.rag.totalTokens) * 100).toFixed(1))
        : null,
    },
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push('# ME-004 Evaluation Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');

  for (const s of report.scenarios) {
    lines.push(`## Scenario: ${s.scenario}`);
    lines.push(`Flags: durability=${s.flags.durability}, scopeIsolation=${s.flags.scopeIsolation}, contextLibrarian=${s.flags.contextLibrarian}`);
    lines.push('');
    lines.push('- RAG total injected: ' + s.rag.totalInjected);
    lines.push('- RAG total tokens: ' + s.rag.totalTokens);
    lines.push('- RAG avg injected/query: ' + s.rag.avgInjected);
    lines.push('- RAG avg tokens/query: ' + s.rag.avgTokens);
    lines.push('');
    lines.push('- Operational retrieval:');
    for (const row of s.retrieval.rows) {
      lines.push(`  - ${row.task} → type=${row.type}, patterns=${row.count}, scopeIsolation=${row.scopeIsolationEnabled}, allowedScopes=${row.allowedScopes.join('|') || 'n/a'}`);
    }
    lines.push('');
    if (!s.promotion.skipped) {
      lines.push(`- Promotion sample: ${s.promotion.patternKey}, confidence=${s.promotion.confidence}`);
    } else {
      lines.push(`- Promotion sample: skipped (${s.promotion.reason})`);
    }
    lines.push('');
  }

  if (report.comparisons?.length) {
    lines.push('## Comparisons vs baseline');
    lines.push('');
    for (const c of report.comparisons) {
      lines.push(`- ${c.variant}: injectedΔ=${c.diff.rag.injectedDelta}, tokenΔ=${c.diff.rag.tokenDelta}, injected%=${c.diff.rag.injectedPct}, token%=${c.diff.rag.tokenPct}`);
    }
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('- ME-004 is evaluation-only; no default behavior changes required.');
  lines.push('- Use this report to decide whether any flagged feature should graduate toward default-on later.');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const outArgIndex = args.indexOf('--out');
  const outBase = outArgIndex !== -1 ? args[outArgIndex + 1] : null;

  const scenarios = [
    { name: 'baseline', flags: { durability: false, scopeIsolation: false, contextLibrarian: false } },
    { name: 'me001_only', flags: { durability: true, scopeIsolation: false, contextLibrarian: false } },
    { name: 'me002_only', flags: { durability: false, scopeIsolation: true, contextLibrarian: false } },
    { name: 'me003_only', flags: { durability: false, scopeIsolation: false, contextLibrarian: true } },
    { name: 'all_flags', flags: { durability: true, scopeIsolation: true, contextLibrarian: true } },
  ];

  const modules = await loadModules();
  const results = [];
  for (const s of scenarios) {
    // eslint-disable-next-line no-await-in-loop
    const res = await evaluateScenario(s.name, s.flags, modules);
    results.push(res);
  }

  const baseline = results.find(r => r.scenario === 'baseline');
  const comparisons = results
    .filter(r => r.scenario !== 'baseline')
    .map(r => ({ variant: r.scenario, diff: compare(baseline, r) }));

  const report = {
    generatedAt: new Date().toISOString(),
    workspace: WORKSPACE,
    scenarios: results,
    comparisons,
  };

  const stamp = nowStamp();
  const outDir = outBase
    ? path.resolve(outBase)
    : path.join(ROOT, 'docs', 'evals');
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `ME-004_eval_${stamp}.json`);
  const mdPath = path.join(outDir, `ME-004_eval_${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, toMarkdown(report));

  console.log(JSON.stringify({ ok: true, json: jsonPath, markdown: mdPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
