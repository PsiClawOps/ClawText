#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[k] = v;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.changeId || !args.feature || !args.status || !args.flag || !args.rollback) {
  console.error('Usage: node scripts/log-memory-evolution-breadcrumb.mjs --changeId ME-001 --feature "..." --status merged --flag memory.consolidation.enabled --rollback "set flag=false" [--defaultState off] [--notes "..."] [--references "a,b,c"] [--output path]');
  process.exit(1);
}

const cwd = process.cwd();
const output = args.output || path.join(cwd, 'memory', 'operational', 'change-breadcrumbs.jsonl');
fs.mkdirSync(path.dirname(output), { recursive: true });

const entry = {
  ts: new Date().toISOString(),
  changeId: args.changeId,
  feature: args.feature,
  status: args.status,
  flag: args.flag,
  defaultState: args.defaultState || 'off',
  impact: {
    clawdash: args.impactClawdash || 'none',
    clawtask: args.impactClawtask || 'none',
    continuityTransfer: args.impactContinuity || 'none',
    latency: args.impactLatency || 'unknown'
  },
  rollback: args.rollback,
  references: args.references ? String(args.references).split(',').map(s => s.trim()).filter(Boolean) : [],
  notes: args.notes || ''
};

fs.appendFileSync(output, JSON.stringify(entry) + '\n', 'utf8');
console.log(`✅ breadcrumb logged: ${output}`);
