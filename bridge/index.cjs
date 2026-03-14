/**
 * ClawBridge v2.0 — Main Module
 *
 * LLM-powered context transfer with progressive summarization.
 * Produces mind-meld packets across 6 knowledge types.
 *
 * Usage:
 *   const bridge = require('./bridge');
 *   const packet = await bridge.extract(messages, { depth: 'standard' });
 *   const markdown = bridge.format(packet, 'full');
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const extractor = require('./extractor.cjs');
const formatter = require('./formatter.cjs');

/**
 * Call an LLM via openclaw agent CLI.
 * Uses `openclaw agent --local --json -m "..."` for one-shot LLM calls.
 * Returns the text response, or null on failure.
 */
function callLLM(prompt, model = null) {
  const args = ['agent', '--agent', 'channel-mini', '--local', '--json', '-m', prompt];
  if (model) args.splice(3, 0, '--model', model);

  try {
    const result = execFileSync('openclaw', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000, // 2 min timeout
      stdio: ['pipe', 'pipe', 'pipe'], // suppress stderr noise
    });

    // Parse JSON response — extract text from payloads array
    try {
      const lines = result.split('\n').filter(l => l.trim());
      // Find the JSON payload (skip log lines that start with [)
      const jsonStart = result.indexOf('{');
      if (jsonStart === -1) return result.trim();
      const parsed = JSON.parse(result.slice(jsonStart));
      if (parsed.payloads?.[0]?.text) return parsed.payloads[0].text;
      return parsed.response || parsed.content || parsed.text || result.trim();
    } catch {
      return result.trim();
    }
  } catch (e) {
    console.error(`[ClawBridge] LLM call failed: ${e.message}`);
    return null;
  }
}

/**
 * Parse YAML from LLM response.
 * Handles fenced code blocks and raw YAML.
 */
function parseYamlResponse(text) {
  // Extract from code fence if present
  const fenced = text.match(/```(?:yaml)?\n([\s\S]*?)\n```/);
  const yamlText = fenced ? fenced[1] : text;

  // Simple YAML parser for our known schema
  // For production, use a proper YAML library
  try {
    // Try JSON parse first (some models output JSON)
    return JSON.parse(yamlText);
  } catch {
    // Basic YAML-to-object conversion for our simple schema
    return { _raw: yamlText };
  }
}

/**
 * Extract a mind-meld packet from messages using LLM pipeline.
 *
 * @param {Array} messages - Raw thread messages
 * @param {Object} config - Extraction configuration
 * @returns {Object} MindMeldPacket
 */
async function extract(messages, config = {}) {
  const depth = config.depth || 'standard';
  const depthConfig = extractor.DEPTH_CONFIG[depth] || extractor.DEPTH_CONFIG.standard;
  const model = config.model || null;

  // Pre-filter messages
  const filtered = extractor.prefilter(messages);
  const limited = filtered.slice(-depthConfig.messages);

  console.log(`[ClawBridge] Extracting: ${limited.length} messages, depth=${depth}, passes=${depthConfig.passes}`);

  // Build context
  const context = {
    objective: config.objective || null,
    previousHandoff: config.previousHandoff || null,
  };

  // Pass 1: Extract
  const extractionPrompt = extractor.buildExtractionPrompt(limited, context);
  const extraction = callLLM(extractionPrompt, model);

  if (!extraction) {
    console.warn('[ClawBridge] LLM extraction failed, falling back to mechanical extraction');
    return mechanicalFallback(limited, config);
  }

  let result = extraction;

  // Pass 2: Compress (if depth requires it)
  if (depthConfig.passes >= 2) {
    const compressionPrompt = extractor.buildCompressionPrompt(extraction, depthConfig.targetTokens);
    const compressed = callLLM(compressionPrompt, model);
    if (compressed) result = compressed;
  }

  // Pass 3: Structure into YAML (if depth requires it)
  let packet;
  if (depthConfig.passes >= 3) {
    const metadata = {
      sourceThread: config.sourceThread || 'unknown',
      messageCount: limited.length,
      depth,
    };
    const structurePrompt = extractor.buildStructuringPrompt(result, metadata);
    const structured = callLLM(structurePrompt, model);
    if (structured) {
      const parsed = parseYamlResponse(structured);
      packet = parsed.handoff || parsed;
    }
  }

  // If we don't have a structured packet yet, wrap the extraction in our schema
  if (!packet || packet._raw) {
    packet = wrapAsPacket(result, limited, config, depth);
  }

  // Validation pass (if configured)
  if (depthConfig.validate && config.validate !== false) {
    const yamlOutput = formatter.formatYaml(packet);
    const validationPrompt = extractor.buildValidationPrompt(yamlOutput, limited);
    const validation = callLLM(validationPrompt, model);

    if (validation) {
      packet.provenance = packet.provenance || {};
      packet.provenance.validation = validation.includes('PASS') ? 'PASS' : 'NEEDS_REVIEW';
      packet.provenance.validationDetails = validation;
    }
  }

  // Add provenance
  packet.provenance = {
    ...(packet.provenance || {}),
    source_thread: config.sourceThread || 'unknown',
    source_messages: limited.length,
    depth,
    passes: depthConfig.passes,
    generated_at: new Date().toISOString(),
    model: model || 'default',
  };

  // Add chain info if provided
  if (config.chain) {
    packet.chain = config.chain;
  }

  return packet;
}

/**
 * Wrap raw LLM extraction text into a MindMeldPacket structure.
 * Used when the structuring pass doesn't produce clean YAML.
 */
function wrapAsPacket(text, messages, config, depth) {
  // Try to parse sections from the extraction text
  const sections = {};
  const sectionRegex = /###?\s*(Episodic|Semantic|Procedural|Relational|Implicit|Priority)[^\n]*/gi;
  let match;
  let lastSection = null;
  let lastIdx = 0;

  while ((match = sectionRegex.exec(text)) !== null) {
    if (lastSection) {
      sections[lastSection] = text.slice(lastIdx, match.index).trim();
    }
    lastSection = match[1].toLowerCase();
    lastIdx = match.index + match[0].length;
  }
  if (lastSection) {
    sections[lastSection] = text.slice(lastIdx).trim();
  }

  return {
    metadata: {
      source_thread: config.sourceThread || 'unknown',
      timestamp: new Date().toISOString(),
      message_count: messages.length,
      depth,
    },
    episodic: { timeline: [], _raw: sections.episodic || '' },
    semantic: { facts: [], state: {}, _raw: sections.semantic || '' },
    procedural: { lessons: [], workflows: [], _raw: sections.procedural || '' },
    relational: { participants: [], _raw: sections.relational || '' },
    implicit: { context: [], _raw: sections.implicit || '' },
    priority: {
      urgency: 'medium',
      blockers: [],
      next_actions: [],
      focus: config.objective || 'Continue active work',
      _raw: sections.priority || '',
    },
  };
}

/**
 * Mechanical fallback extraction (no LLM).
 * Used when LLM is unavailable or for quick depth.
 */
function mechanicalFallback(messages, config) {
  const chronological = [...messages].reverse();
  const nonBot = chronological.filter(m => !m?.author?.bot && String(m?.content || '').trim());
  const botMsgs = chronological.filter(m => m?.author?.bot && String(m?.content || '').trim());

  // Extract facts from bot messages
  const facts = [];
  const decisions = [];
  const events = [];

  for (const m of botMsgs.slice(-15)) {
    const content = String(m.content || '');
    const lines = content.split('\n').map(s => s.trim());

    for (const line of lines) {
      const density = extractor.scoreDensity(line);
      if (density >= 0.7) {
        if (/\b(decided|decision|agreed|approved)\b/i.test(line)) {
          decisions.push(line.replace(/^[-•*]\s*/, ''));
        } else {
          facts.push(line.replace(/^[-•*]\s*/, ''));
        }
      }
    }
  }

  // Build timeline from message timestamps
  const dateEvents = {};
  for (const m of chronological.slice(-50)) {
    const ts = m.timestamp;
    if (!ts) continue;
    const date = ts.split('T')[0];
    if (!dateEvents[date]) dateEvents[date] = [];
    const content = String(m.content || '').trim().split('\n')[0].slice(0, 120);
    if (content && extractor.scoreDensity(content) > 0.3) {
      dateEvents[date].push(content);
    }
  }

  const timeline = Object.entries(dateEvents)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, evts]) => ({ date, events: evts.slice(0, 5) }));

  return {
    metadata: {
      source_thread: config.sourceThread || 'unknown',
      timestamp: new Date().toISOString(),
      message_count: messages.length,
      depth: 'mechanical',
    },
    episodic: { timeline },
    semantic: {
      facts: facts.slice(0, 10).map(f => ({ key: 'fact', value: f, type: 'extracted' })),
      state: { status: 'Active' },
    },
    procedural: { lessons: [], workflows: [] },
    relational: { participants: [], dynamics: '' },
    implicit: { context: [] },
    priority: {
      urgency: 'medium',
      blockers: [],
      next_actions: decisions.slice(0, 5).map(d => ({ action: d, priority: 'P1' })),
      focus: config.objective || 'Continue active work',
    },
  };
}

/**
 * Format a mind-meld packet into the specified output format.
 *
 * @param {Object} packet - MindMeldPacket
 * @param {string} format - 'short'|'full'|'bootstrap'|'clipboard'|'yaml'
 * @param {Object} [options] - Additional options (paths, previousPacket for diff)
 * @returns {string}
 */
function format(packet, fmt = 'full', options = {}) {
  switch (fmt) {
    case 'short':     return formatter.formatShort(packet, options.paths);
    case 'full':      return formatter.formatFull(packet);
    case 'bootstrap': return formatter.formatBootstrap(packet, options.paths);
    case 'clipboard': return formatter.formatClipboard(packet);
    case 'yaml':      return formatter.formatYaml(packet);
    case 'diff':      return formatter.formatDiff(packet, options.previousPacket);
    default:          return formatter.formatFull(packet);
  }
}

/**
 * Full pipeline: read messages → extract → format → save artifacts.
 *
 * @param {Object} config
 * @returns {Object} { packet, artifacts }
 */
async function pipeline(config) {
  const {
    messages,
    depth = 'standard',
    sourceThread,
    objective,
    model,
    previousHandoff,
    chain,
    workspace = path.join(process.env.HOME || '', '.openclaw', 'workspace'),
    validate,
  } = config;

  // Extract
  const packet = await extract(messages, {
    depth,
    sourceThread,
    objective,
    model,
    previousHandoff,
    chain,
    validate,
  });

  // Prepare output paths
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const handoffsDir = path.join(workspace, 'docs', 'handoffs');
  const bootstrapDir = path.join(workspace, 'docs', 'bootstrap');
  fs.mkdirSync(handoffsDir, { recursive: true });
  fs.mkdirSync(bootstrapDir, { recursive: true });

  const paths = {
    short: path.join(handoffsDir, `CLAWBRIDGE_SHORT_${stamp}.md`),
    full: path.join(handoffsDir, `CLAWBRIDGE_FULL_${stamp}.md`),
    bootstrap: path.join(bootstrapDir, `NEXT_AGENT_BOOTSTRAP_${stamp}.md`),
    yaml: path.join(handoffsDir, `CLAWBRIDGE_MINDMELD_${stamp}.yaml`),
  };

  // Format all outputs
  const artifacts = {
    short: format(packet, 'short', { paths: { full: path.relative(workspace, paths.full) } }),
    full: format(packet, 'full'),
    bootstrap: format(packet, 'bootstrap', {
      paths: {
        full: path.relative(workspace, paths.full),
        short: path.relative(workspace, paths.short),
      },
    }),
    yaml: format(packet, 'yaml'),
    clipboard: format(packet, 'clipboard'),
  };

  // Save to disk
  fs.writeFileSync(paths.short, artifacts.short);
  fs.writeFileSync(paths.full, artifacts.full);
  fs.writeFileSync(paths.bootstrap, artifacts.bootstrap);
  fs.writeFileSync(paths.yaml, artifacts.yaml);

  return { packet, artifacts, paths };
}

module.exports = {
  extract,
  format,
  pipeline,
  mechanicalFallback,
  DEPTH_CONFIG: extractor.DEPTH_CONFIG,
  scoreDensity: extractor.scoreDensity,
};
