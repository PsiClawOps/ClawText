/**
 * ClawBridge v2.0 — Multi-Format Output Formatter
 *
 * Takes a MindMeldPacket (structured YAML) and produces output in
 * multiple formats: markdown, YAML, clipboard, diff.
 */

const yaml = (() => {
  // Lightweight YAML serializer (no dependency needed for simple structures)
  function stringify(obj, indent = 0) {
    const pad = '  '.repeat(indent);
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'string') return `"${obj.replace(/"/g, '\\"')}"`;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return obj.map(item => {
        if (typeof item === 'object' && item !== null) {
          const inner = stringify(item, indent + 1);
          return `${pad}- ${inner.trim()}`;
        }
        return `${pad}- ${stringify(item)}`;
      }).join('\n');
    }
    if (typeof obj === 'object') {
      return Object.entries(obj).map(([k, v]) => {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          return `${pad}${k}:\n${stringify(v, indent + 1)}`;
        }
        if (Array.isArray(v)) {
          if (v.length === 0) return `${pad}${k}: []`;
          return `${pad}${k}:\n${stringify(v, indent + 1)}`;
        }
        return `${pad}${k}: ${stringify(v)}`;
      }).join('\n');
    }
    return String(obj);
  }
  return { stringify };
})();

/**
 * Format mind-meld packet as short handoff summary (markdown).
 */
function formatShort(packet, paths = {}) {
  const p = packet.priority || {};
  const s = packet.semantic || {};
  const e = packet.episodic || {};

  const status = s.state?.status || (s._raw ? 'Active' : 'Unknown');
  const blockers = (p.blockers || []).map(b => `• ${typeof b === 'string' ? b : b.description || b}`).join('\n');
  const nextActions = (p.next_actions || []).slice(0, 3).map(a => `• ${typeof a === 'string' ? a : a.action || a}`).join('\n');
  const decisions = [];

  // Pull recent timeline events as context
  const timeline = e.timeline || [];
  const recentEvents = timeline.slice(-3).flatMap(t =>
    (t.events || []).map(ev => `• ${t.date}: ${ev}`)
  );

  // If _raw exists in episodic but no structured timeline, extract key events
  if (!recentEvents.length && e._raw) {
    const rawLines = e._raw.split('\n')
      .filter(l => l.match(/^\d+\.\s*\*\*/))
      .slice(-3)
      .map(l => `• ${l.replace(/^\d+\.\s*/, '').trim()}`);
    recentEvents.push(...rawLines);
  }

  const sections = [
    `# ClawBridge Handoff — Short Summary`,
    '',
    `**Status:** ${status}`,
    `**Urgency:** ${p.urgency || 'medium'}`,
    `**Focus:** ${p.focus || 'Continue active work'}`,
  ];

  if (blockers) {
    sections.push('', '**Blockers:**', blockers);
  } else if (p._raw && /block/i.test(p._raw)) {
    const rawBlockers = p._raw.split('\n')
      .filter(l => /block|critical/i.test(l))
      .slice(0, 3)
      .map(l => `• ${l.replace(/^\d+\.\s*/, '').trim()}`);
    if (rawBlockers.length) sections.push('', '**Blockers:**', ...rawBlockers);
  }

  if (nextActions) {
    sections.push('', '**Next Actions:**', nextActions);
  } else if (p._raw) {
    const rawActions = p._raw.split('\n')
      .filter(l => l.match(/^\d+\.\s*\*\*/))
      .slice(0, 3)
      .map(l => `• ${l.replace(/^\d+\.\s*/, '').trim()}`);
    if (rawActions.length) sections.push('', '**Top Priorities:**', ...rawActions);
  }

  if (recentEvents.length) {
    sections.push('', '**Recent:**', ...recentEvents);
  }

  if (paths.full) {
    sections.push('', `**Full context:** ${paths.full}`);
  }

  return sections.join('\n');
}

/**
 * Format mind-meld packet as full continuity document (markdown).
 */
function formatFull(packet) {
  const m = packet.metadata || {};
  const e = packet.episodic || {};
  const s = packet.semantic || {};
  const proc = packet.procedural || {};
  const r = packet.relational || {};
  const imp = packet.implicit || {};
  const p = packet.priority || {};

  const sections = [
    `# ClawBridge — Full Continuity Packet`,
    '',
    `> Generated ${m.timestamp || new Date().toISOString()} | Source: ${m.source_thread || 'unknown'} | ${m.message_count || '?'} messages | Depth: ${m.depth || 'standard'}`,
    '',
  ];

  // Priority (put this first — what matters NOW)
  sections.push('## 🎯 Priority');
  sections.push(`**Urgency:** ${p.urgency || 'medium'}`);
  sections.push(`**Focus:** ${p.focus || 'Continue active work'}`);
  if (p.blockers?.length) {
    sections.push('', '**Blockers:**');
    p.blockers.forEach(b => sections.push(`- 🔴 ${typeof b === 'string' ? b : b}`));
  } else if (p._raw && /block/i.test(p._raw)) {
    sections.push('', '**Blockers:**');
    sections.push(p._raw.split('\n').filter(l => /block/i.test(l)).slice(0, 5).map(l => `- ${l.trim()}`).join('\n'));
  }
  if (p.next_actions?.length) {
    sections.push('', '**Next Actions:**');
    p.next_actions.forEach(a => {
      const action = typeof a === 'string' ? a : a.action || a;
      const pri = typeof a === 'object' ? ` (${a.priority || ''})` : '';
      sections.push(`- ${action}${pri}`);
    });
  } else if (p._raw) {
    sections.push('', '**Priority Assessment:**');
    sections.push(p._raw);
  }
  sections.push('');

  // Semantic (facts, state)
  sections.push('## 📦 Facts & State');
  if (s.state && Object.keys(s.state).length) {
    Object.entries(s.state).forEach(([k, v]) => {
      sections.push(`- **${k}:** ${v}`);
    });
  }
  if (s.facts?.length) {
    sections.push('', '**Key Identifiers:**');
    s.facts.forEach(f => {
      sections.push(`- \`${f.key}\`: \`${f.value}\` (${f.type || 'fact'})`);
    });
  } else if (s._raw) {
    sections.push(s._raw);
  }
  sections.push('');

  // Episodic (timeline)
  sections.push('## 🕐 Timeline');
  if ((e.timeline || []).length) {
    (e.timeline || []).forEach(t => {
      sections.push(`\n### ${t.date || 'Unknown date'}`);
      (t.events || []).forEach(ev => sections.push(`- ${ev}`));
    });
  } else if (e._raw) {
    sections.push(e._raw);
  }
  sections.push('');

  // Procedural (lessons, workflows)
  if (proc.lessons?.length || proc.workflows?.length || proc._raw) {
    sections.push('## 🔧 Lessons & Workflows');
    (proc.lessons || []).forEach(l => {
      if (typeof l === 'string') {
        sections.push(`- ${l}`);
      } else {
        sections.push(`- **When:** ${l.trigger || '?'}`);
        sections.push(`  **Do:** ${l.action || '?'}`);
        if (l.reason) sections.push(`  **Why:** ${l.reason}`);
      }
    });
    (proc.workflows || []).forEach(w => {
      sections.push(`\n**${w.name || 'Workflow'}:**`);
      (w.steps || []).forEach((s, i) => sections.push(`${i + 1}. ${s}`));
    });
    if (proc._raw && !proc.lessons?.length && !proc.workflows?.length) {
      sections.push(proc._raw);
    }
    sections.push('');
  }

  // Relational
  if (r.participants?.length || r.dynamics || r._raw) {
    sections.push('## 👥 Working Dynamics');
    if (r.dynamics) sections.push(r.dynamics);
    (r.participants || []).forEach(p => {
      sections.push(`- **${p.name}** (${p.role || 'participant'}): ${p.style || ''}`);
    });
    if (r._raw && !r.participants?.length && !r.dynamics) {
      sections.push(r._raw);
    }
    sections.push('');
  }

  // Implicit
  if (imp.context?.length || imp.quality_bar || imp._raw) {
    sections.push('## 💡 Implicit Context');
    if (imp.quality_bar) sections.push(`**Quality bar:** ${imp.quality_bar}`);
    (imp.context || []).forEach(c => {
      const conf = c.confidence ? ` (confidence: ${c.confidence})` : '';
      sections.push(`- ${c.observation || c}${conf}`);
    });
    if (imp._raw && !imp.context?.length && !imp.quality_bar) {
      sections.push(imp._raw);
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Format as agent bootstrap document (what to do first).
 */
function formatBootstrap(packet, paths = {}) {
  const p = packet.priority || {};
  const s = packet.semantic || {};
  const proc = packet.procedural || {};

  const sections = [
    '# Agent Bootstrap — ClawBridge Handoff',
    '',
    '## Read These First',
  ];

  if (paths.full) sections.push(`1. ${paths.full}`);
  if (paths.short) sections.push(`2. ${paths.short}`);
  sections.push('');

  sections.push('## Current Focus');
  sections.push(p.focus || 'Continue active work from where the previous agent left off.');
  sections.push('');

  sections.push('## First Action');
  const firstAction = p.next_actions?.[0];
  sections.push(typeof firstAction === 'string' ? firstAction : firstAction?.action || 'Review the full continuity packet and confirm understanding.');
  sections.push('');

  if (p.blockers?.length) {
    sections.push('## Active Blockers');
    p.blockers.forEach(b => sections.push(`- 🔴 ${typeof b === 'string' ? b : b}`));
    sections.push('');
  }

  // Key facts the agent needs immediately
  if (s.facts?.length) {
    sections.push('## Critical Identifiers');
    s.facts.slice(0, 10).forEach(f => {
      sections.push(`- \`${f.key}\` = \`${f.value}\``);
    });
    sections.push('');
  }

  // Lessons to avoid re-learning
  if (proc.lessons?.length) {
    sections.push('## Avoid Re-Learning');
    proc.lessons.slice(0, 5).forEach(l => {
      if (typeof l === 'string') sections.push(`- ${l}`);
      else sections.push(`- ${l.trigger}: ${l.action}`);
    });
    sections.push('');
  }

  sections.push('## Do Not Re-Derive');
  sections.push('- Anything marked as "decided" in the full packet is settled. Do not revisit without explicit request.');
  sections.push('- All identifiers (versions, paths, hashes) are verified. Use them as-is.');

  return sections.join('\n');
}

/**
 * Format as clipboard-friendly paste format.
 */
function formatClipboard(packet) {
  const p = packet.priority || {};
  const s = packet.semantic || {};

  const lines = [
    `🧠 CLAWBRIDGE HANDOFF — ${s.state?.project || 'Project'}`,
    '',
    `STATUS: ${s.state?.status || (s._raw ? 'Active' : 'Unknown')}`,
    `URGENCY: ${p.urgency || 'medium'}`,
    `FOCUS: ${p.focus || 'Continue active work'}`,
  ];

  if (p.blockers?.length) {
    lines.push('', 'BLOCKERS:');
    p.blockers.forEach(b => lines.push(`• ${typeof b === 'string' ? b : b}`));
  }

  if (p.next_actions?.length) {
    lines.push('', 'NEXT:');
    p.next_actions.slice(0, 3).forEach(a => {
      lines.push(`• ${typeof a === 'string' ? a : a.action || a}`);
    });
  } else if (p._raw) {
    const rawActions = p._raw.split('\n')
      .filter(l => l.match(/^\d+\.\s*\*\*/))
      .slice(0, 3)
      .map(l => `• ${l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim()}`);
    if (rawActions.length) lines.push('', 'NEXT:', ...rawActions);
  }

  if (s.facts?.length) {
    lines.push('', 'KEY IDS:');
    s.facts.slice(0, 5).forEach(f => lines.push(`• ${f.key}: ${f.value}`));
  }

  return lines.join('\n');
}

/**
 * Format as YAML (machine-readable mind-meld).
 */
function formatYaml(packet) {
  return yaml.stringify({ handoff: packet });
}

/**
 * Generate a diff between two handoff packets.
 * Shows what changed between handoffs for efficient context transfer.
 */
function formatDiff(currentPacket, previousPacket) {
  if (!previousPacket) return '# No previous handoff to diff against\n';

  const lines = [
    `# ClawBridge Diff — Changes Since Last Handoff`,
    `# Previous: ${previousPacket.metadata?.timestamp || 'unknown'}`,
    `# Current:  ${currentPacket.metadata?.timestamp || new Date().toISOString()}`,
    '',
  ];

  // Compare decisions/events (episodic)
  const prevEvents = new Set(
    (previousPacket.episodic?.timeline || []).flatMap(t => t.events || [])
  );
  const currEvents = (currentPacket.episodic?.timeline || []).flatMap(t =>
    (t.events || []).map(e => ({ date: t.date, event: e }))
  );
  const newEvents = currEvents.filter(e => !prevEvents.has(e.event));

  if (newEvents.length) {
    lines.push('## New Events');
    newEvents.forEach(e => lines.push(`+ [${e.date}] ${e.event}`));
    lines.push('');
  }

  // Compare blockers
  const prevBlockers = new Set((previousPacket.priority?.blockers || []).map(String));
  const currBlockers = (currentPacket.priority?.blockers || []).map(String);
  const newBlockers = currBlockers.filter(b => !prevBlockers.has(b));
  const resolvedBlockers = [...prevBlockers].filter(b => !new Set(currBlockers).has(b));

  if (newBlockers.length || resolvedBlockers.length) {
    lines.push('## Blockers');
    newBlockers.forEach(b => lines.push(`+ ${b}`));
    resolvedBlockers.forEach(b => lines.push(`- ${b} [RESOLVED]`));
    lines.push('');
  }

  // Compare semantic facts
  const prevFacts = new Map((previousPacket.semantic?.facts || []).map(f => [f.key, f.value]));
  const currFacts = (currentPacket.semantic?.facts || []);
  const changedFacts = currFacts.filter(f => {
    const prev = prevFacts.get(f.key);
    return prev === undefined || prev !== f.value;
  });

  if (changedFacts.length) {
    lines.push('## Changed Facts');
    changedFacts.forEach(f => {
      const prev = prevFacts.get(f.key);
      if (prev) {
        lines.push(`~ ${f.key}: ${prev} → ${f.value}`);
      } else {
        lines.push(`+ ${f.key}: ${f.value}`);
      }
    });
    lines.push('');
  }

  if (lines.length <= 5) {
    lines.push('No significant changes detected.');
  }

  return lines.join('\n');
}

module.exports = {
  formatShort,
  formatFull,
  formatBootstrap,
  formatClipboard,
  formatYaml,
  formatDiff,
};
