#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) {
      out._.push(a);
      continue;
    }

    if (a.startsWith('--')) {
      const body = a.slice(2);
      let key = body;
      let value = true;
      if (body.includes('=')) {
        const idx = body.indexOf('=');
        key = body.slice(0, idx);
        value = body.slice(idx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        value = argv[++i];
      }

      if (out[key] === undefined) out[key] = value;
      else if (Array.isArray(out[key])) out[key].push(value);
      else out[key] = [out[key], value];
      continue;
    }

    // short flags: -m value
    const key = a.replace(/^-+/, '');
    let value = true;
    if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
      value = argv[++i];
    }
    out[key] = value;
  }
  return out;
}

function asArray(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function extractJson(output) {
  const t = String(output || '').trim();
  const idx = t.indexOf('{');
  if (idx === -1) throw new Error('No JSON object found in command output');
  const candidate = t.slice(idx);
  return JSON.parse(candidate);
}

function runOpenclaw(args) {
  const out = execFileSync('openclaw', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return extractJson(out);
}

function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

function uniq(xs) {
  const seen = new Set();
  const out = [];
  for (const x of xs) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function splitForDiscord(text, max = 1800) {
  const raw = String(text || '');
  if (raw.length <= max) return [raw];

  const paras = raw.split('\n\n');
  const chunks = [];
  let cur = '';

  for (const p of paras) {
    if (!cur) {
      if (p.length <= max) cur = p;
      else {
        for (let i = 0; i < p.length; i += max) chunks.push(p.slice(i, i + max));
      }
      continue;
    }

    const candidate = `${cur}\n\n${p}`;
    if (candidate.length <= max) {
      cur = candidate;
    } else {
      chunks.push(cur);
      if (p.length <= max) cur = p;
      else {
        for (let i = 0; i < p.length; i += max) chunks.push(p.slice(i, i + max));
        cur = '';
      }
    }
  }

  if (cur) chunks.push(cur);
  return chunks;
}

function readMessages(sourceThreadId, limit) {
  const resp = runOpenclaw([
    'message', 'read',
    '--channel', 'discord',
    '--target', `channel:${sourceThreadId}`,
    '--limit', String(limit),
    '--json',
  ]);

  const msgs = resp?.payload?.messages || [];
  return Array.isArray(msgs) ? msgs : [];
}

function makeArtifacts(args, messages, paths) {
  const chronological = [...messages].reverse();
  const nonBot = [...chronological].filter(m => !m?.author?.bot && String(m?.content || '').trim());
  const botMsgs = [...chronological].filter(m => m?.author?.bot && String(m?.content || '').trim());

  const objective = (args.objective && String(args.objective).trim()) ||
    (nonBot.length ? String(nonBot[nonBot.length - 1].content).trim().slice(0, 260) : 'Continue active work with full continuity.');

  let established = uniq(asArray(args.established));
  if (!established.length) {
    const bullets = [];
    for (const m of botMsgs.slice(-10)) {
      const lines = String(m.content || '').split('\n').map(s => s.trim());
      for (const line of lines) {
        if (line.startsWith('- ') || line.startsWith('• ')) bullets.push(line.replace(/^[-•]\s*/, ''));
      }
    }
    established = uniq(bullets).slice(0, 6);
  }
  if (!established.length) {
    established = [
      'ClawBridge is continuity + transfer (not just thread mechanics).',
      'ClawTask is a core ClawDash coordination pillar.',
      'Continuity artifacts are distinct from durable memory artifacts.',
    ];
  }

  let open = uniq(asArray(args.open));
  if (!open.length) {
    const lastUser = nonBot.length ? String(nonBot[nonBot.length - 1].content || '') : '';
    const guessed = lastUser.split(/\?|\n/).map(s => s.trim()).filter(Boolean).slice(0, 3);
    open = guessed.length ? guessed.map(s => `${s}?`) : [
      'Finalize first milestone execution order for ClawTask.',
      'Define incident taxonomy and action-policy matrix details.',
      'Define automation boundaries for ClawBridge Phase 2.',
    ];
  }

  let next = uniq(asArray(args.next));
  if (!next.length) {
    next = [
      'Seed ClawTask board cards for Milestone 1 in ClawDash lane.',
      'Finalize shared event schema and telemetry entities.',
      'Use ClawBridge continuity packets for major lane transfers.',
    ];
  }

  const lane = args.lane || 'ClawDash coordination lane';
  const product = args.product || 'ClawDash / ClawBridge';

  const short = [
    '# ClawBridge Extract — Short Handoff',
    '',
    `**Context:** ${objective}`,
    '',
    '**Established:**',
    ...established.map(x => `- ${x}`),
    '',
    '**Open now:**',
    ...open.map(x => `- ${x}`),
    '',
    '**Next:**',
    ...next.map(x => `- ${x}`),
    '',
    '**Full context:**',
    `- ${path.relative(args.workspace, paths.full)}`,
    `- ${path.relative(args.workspace, paths.bootstrap)}`,
  ].join('\n');

  const full = [
    '# ClawBridge Extract — Full Continuity Packet',
    '',
    '## Why this handoff exists',
    'Transfer active work into a focused lane without losing high-context continuity.',
    '',
    '## Current objective',
    objective,
    '',
    '## Established decisions',
    ...established.map(x => `- ${x}`),
    '',
    '## Open questions',
    ...open.map(x => `- ${x}`),
    '',
    '## Lane / product context',
    `- **Product:** ${product}`,
    `- **Lane:** ${lane}`,
    `- **Source thread:** ${args.sourceThread}`,
    `- **Target forum:** ${args.targetForum}`,
    '',
    '## Relevant artifacts',
    `- ${path.relative(args.workspace, paths.short)}`,
    `- ${path.relative(args.workspace, paths.full)}`,
    `- ${path.relative(args.workspace, paths.bootstrap)}`,
    '',
    '## Immediate next steps',
    ...next.map((x, i) => `${i + 1}. ${x}`),
    '',
    '## What not to re-litigate',
    '- Continuity and durable memory are distinct concerns.',
    '- ClawBridge naming is final and should be used directly.',
  ].join('\n');

  const bootstrap = [
    '# Next-Agent Bootstrap — ClawBridge Extract',
    '',
    '## Read these first',
    `1. ${path.relative(args.workspace, paths.full)}`,
    `2. ${path.relative(args.workspace, paths.short)}`,
    '',
    '## Current objective',
    objective,
    '',
    '## Already decided',
    ...established.map(x => `- ${x}`),
    '',
    '## Still open',
    ...open.map(x => `- ${x}`),
    '',
    '## First action',
    (next[0] || 'Continue from the latest milestone tasks.'),
    '',
    '## Avoid re-deriving',
    '- Core platform pillar split and role boundaries.',
    '- ClawBridge role as continuity + transfer layer.',
  ].join('\n');

  fs.writeFileSync(paths.short, short);
  fs.writeFileSync(paths.full, full);
  fs.writeFileSync(paths.bootstrap, bootstrap);

  return { short, full, bootstrap };
}

function createThread(targetForum, title, initMessage) {
  const resp = runOpenclaw([
    'message', 'thread', 'create',
    '--channel', 'discord',
    '--target', `channel:${targetForum}`,
    `--thread-name=${title}`,
    '-m', initMessage,
    '--json',
  ]);

  const thread = resp?.payload?.thread || resp?.thread || {};
  const threadId = thread.id;
  if (!threadId) throw new Error('Failed to parse created thread id');
  return threadId;
}

function sendToThread(threadId, text) {
  const chunks = splitForDiscord(text, 1800);
  for (const c of chunks) {
    runOpenclaw([
      'message', 'send',
      '--channel', 'discord',
      '--target', threadId,
      '-m', c,
      '--json',
    ]);
  }
}

function maybeIngest(args, fullPath) {
  if (!args.ingest) return { ingested: false };
  const ingestCli = path.join(args.workspace, 'skills', 'clawtext', 'bin', 'ingest.js');
  const buildClusters = path.join(args.workspace, 'skills', 'clawtext', 'scripts', 'build-clusters.js');

  execFileSync('node', [
    ingestCli,
    'ingest-text',
    `--input=${fullPath}`,
    `--project=${args.project || 'clawbridge'}`,
    `--source=${args.source || 'clawbridge:auto'}`,
    '--type=continuity-packet',
    '--verbose',
  ], { stdio: 'inherit' });

  if (args.rebuild !== false) {
    execFileSync('node', [buildClusters, '--force'], { stdio: 'inherit' });
  }

  return { ingested: true };
}

function showHelp() {
  console.log(`
ClawBridge CLI (Phase 1)
=======================

Usage:
  clawbridge extract-discord-thread --source-thread <id> --target-forum <id> [options]

Options:
  --mode <continuity|memory|dual>   Output mode (default: continuity)
  --limit <n>                       Message read limit (default: 80)
  --workspace <path>                Workspace root (default: ~/.openclaw/workspace)
  --title "..."                     Required only when creating a new thread
  --attach-thread <id>              Post packet into an existing thread instead of creating one
  --no-create-thread                Generate artifacts only (no Discord post)

  # agent-led overrides (manual where needed)
  --objective "..."
  --established "..."              Repeatable
  --open "..."                     Repeatable
  --next "..."                     Repeatable
  --product "..."
  --lane "..."

  # optional durable promotion
  --ingest                          Promote full packet via ClawText ingest
  --project <name>                  Ingest project label (default: clawbridge)
  --source <label>                  Ingest source label (default: clawbridge:auto)
  --no-rebuild                      Skip cluster rebuild after ingest

Example:
  clawbridge extract-discord-thread \
    --source-thread 1480315446694641664 \
    --target-forum 1475021817168134144 \
    --title "ClawBridge Test Extract" \
    --mode dual \
    --ingest \
    --objective "Transfer architecture continuity to ClawDash lane"
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help' || args.help || args.h) {
    showHelp();
    process.exit(0);
  }

  if (cmd !== 'extract-discord-thread') {
    console.error(`Unknown command: ${cmd}`);
    showHelp();
    process.exit(1);
  }

  const workspace = args.workspace || path.join(process.env.HOME || '', '.openclaw', 'workspace');
  const sourceThread = args['source-thread'] || args.sourceThread;
  const targetForum = args['target-forum'] || args.targetForum;
  const title = args.title;
  const attachThread = args['attach-thread'] || args.attachThread;
  const noCreateThread = Boolean(args['no-create-thread'] || args.noCreateThread);
  const mode = (args.mode || 'continuity').toLowerCase();
  const limit = Number(args.limit || 80);

  if (!sourceThread || !targetForum) {
    console.error('Missing required args: --source-thread, --target-forum');
    process.exit(1);
  }

  if (!attachThread && !noCreateThread && !title) {
    console.error('Missing required arg when creating a new thread: --title');
    process.exit(1);
  }

  const stamp = nowStamp();
  const handoffsDir = path.join(workspace, 'docs', 'handoffs');
  const bootstrapDir = path.join(workspace, 'docs', 'bootstrap');
  fs.mkdirSync(handoffsDir, { recursive: true });
  fs.mkdirSync(bootstrapDir, { recursive: true });

  const paths = {
    short: path.join(handoffsDir, `CLAWBRIDGE_SHORT_${stamp}.md`),
    full: path.join(handoffsDir, `CLAWBRIDGE_FULL_${stamp}.md`),
    bootstrap: path.join(bootstrapDir, `NEXT_AGENT_BOOTSTRAP_CLAWBRIDGE_${stamp}.md`),
  };

  const normalizedArgs = {
    ...args,
    workspace,
    sourceThread,
    targetForum,
    title,
  };

  const messages = readMessages(sourceThread, limit);
  const artifacts = makeArtifacts(normalizedArgs, messages, paths);

  const initMsg = [
    `🧠 **ClawBridge extract (${mode}) complete**`,
    '',
    `Source thread: ${sourceThread}`,
    `Generated artifacts:`,
    `- ${path.relative(workspace, paths.short)}`,
    `- ${path.relative(workspace, paths.full)}`,
    `- ${path.relative(workspace, paths.bootstrap)}`,
  ].join('\n');

  let threadId = attachThread || null;
  const createdThread = !threadId && !noCreateThread;
  if (createdThread) {
    threadId = createThread(targetForum, title, initMsg);
  }

  if (threadId) {
    if (!createdThread) {
      sendToThread(threadId, initMsg);
    }

    if (mode !== 'memory') {
      sendToThread(threadId, `## SHORT HANDOFF\n\n${artifacts.short}`);
      sendToThread(threadId, `## FULL CONTINUITY PACKET\n\n${artifacts.full}`);
      sendToThread(threadId, `## NEXT-AGENT BOOTSTRAP\n\n${artifacts.bootstrap}`);
    } else {
      sendToThread(threadId, `## MEMORY-PROMOTION CANDIDATE\n\n${artifacts.full}`);
    }
  }

  if (args.ingest) maybeIngest({ ...args, workspace }, paths.full);

  const guild = args['guild-id'] || args.guildId || '1474997926919929927';
  const url = threadId ? `https://discord.com/channels/${guild}/${targetForum}/${threadId}` : null;

  console.log(JSON.stringify({
    ok: true,
    mode,
    threadId,
    threadUrl: url,
    createdThread,
    posted: Boolean(threadId),
    artifacts: paths,
    ingested: Boolean(args.ingest),
  }, null, 2));
}

main();
