const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);

// Summarizer: tries to spawn a subagent session using OpenClaw sessions_spawn
// with runtime=subagent and model=prd. If that fails, falls back to a naive
// extractive summarization.

async function summarize(messages, opts = {}) {
  const style = opts.style || 'detailed';
  const mode = opts.mode || 'refresh';

  const prompt = buildPrompt(messages, { style, mode, titleHint: opts.titleHint });

  // Attempt sessions_spawn
  const cmd = `openclaw sessions spawn --runtime=subagent --model=prd --stdin`;
  try {
    const child = exec(cmd, { maxBuffer: 1024 * 1024 });
    child.stdin.write(prompt);
    child.stdin.end();

    const out = await new Promise((resolve, reject) => {
      let buf = '';
      child.stdout.on('data', d => buf += d.toString());
      child.stderr.on('data', d => buf += d.toString());
      child.on('close', code => {
        if (code === 0) resolve(buf);
        else resolve(buf); // still resolve with output
      });
      child.on('error', err => reject(err));
    });

    // Try parse JSON-like response, otherwise return raw
    return out.trim() || naiveSummarize(messages, style);
  } catch (err) {
    return naiveSummarize(messages, style);
  }
}

function buildPrompt(messages, { style = 'detailed', mode = 'refresh', titleHint } = {}) {
  const header = `You are a summarization assistant for thread-bridge. Produce a summary including: current state, key decisions, active tasks, blockers, next steps. Use style: ${style}. Mode: ${mode}.`;
  let body = messages && messages.length ? messages.map(m => `- ${m.author || 'user'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n') : '(no messages)';
  if (titleHint) body = `Title hint: ${titleHint}\n\n` + body;
  return `${header}\n\n${body}\n\nRespond with plain text. `;
}

function naiveSummarize(messages, style) {
  if (!messages || messages.length === 0) return 'No messages to summarize.';
  const recent = messages.slice(-Math.min(messages.length, 20));
  const lines = recent.map(m => `${m.author || 'user'}: ${truncate(m.content, 240)}`);
  const summary = [];
  summary.push('Summary (naive):');
  if (style === 'brief') summary.push(lines.slice(-5).join('\n'));
  else if (style === 'bullets') summary.push(lines.map(l => `• ${l}`).join('\n'));
  else {
    summary.push('Recent messages:\n' + lines.join('\n'));
    summary.push('\nNext steps: Review the most recent messages and continue the discussion.');
  }
  return summary.join('\n\n');
}

function truncate(s, n) { return (s && s.length > n) ? s.slice(0,n-1)+'…' : s; }

module.exports = { summarize };
