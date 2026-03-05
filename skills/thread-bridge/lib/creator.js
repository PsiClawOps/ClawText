const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.resolve(process.cwd(), 'memory/thread-bridge-log.jsonl');

async function createThread(forumChannelId, title, initialMessage) {
  // openclaw message --action=thread-create --channel=<forumChannelId> --name="<title>" --message='<initialMessage>'
  const safeMsg = JSON.stringify(String(initialMessage || ''));
  const cmd = `openclaw message --action=thread-create --channel=${forumChannelId} --name=${JSON.stringify(title || 'New Thread')} --message=${safeMsg}`;
  try {
    const { stdout } = await execp(cmd, { timeout: 20000 });
    try {
      const parsed = JSON.parse(stdout);
      const id = parsed.id || (parsed.thread && parsed.thread.id) || parsed.thread_id;
      const url = parsed.url || parsed.thread && parsed.thread.url;
      return { id, url, raw: parsed };
    } catch (e) {
      return { id: null, url: null, raw: stdout };
    }
  } catch (err) {
    throw new Error(`Failed to create thread: ${err.message}`);
  }
}

async function nextPartNumber(forumChannelId, sourceTitle) {
  // Best-effort: query recent threads in forum and count parts
  const cmd = `openclaw message --action=list --channel=${forumChannelId} --limit=50`;
  try {
    const { stdout } = await execp(cmd, { timeout: 8000 });
    let parsed;
    try { parsed = JSON.parse(stdout); } catch (e) { parsed = null; }
    if (parsed && Array.isArray(parsed.threads)) {
      const regex = new RegExp(`^${escapeRegex(sourceTitle)}\\s*—\\s*Part\\s*(\\d+)$`);
      let max = 1;
      parsed.threads.forEach(t => {
        if (t.name) {
          const m = t.name.match(regex);
          if (m) max = Math.max(max, Number(m[1]) + 1);
        }
      });
      return max;
    }
    return 2;
  } catch (err) {
    return 2;
  }
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function buildThreadUrl(forumId, threadId) {
  // Best-effort constructing Discord URL
  return `https://discord.com/channels/${process.env.DISCORD_GUILD_ID || ''}/${forumId}/${threadId}`;
}

async function autoTitleFromSummary(summary) {
  // Pick first line or generate short title
  if (!summary) return 'Split Thread';
  const firstLine = summary.split('\n').find(l => l.trim());
  let title = firstLine ? firstLine.trim().slice(0, 80) : 'Split Thread';
  return title;
}

async function logOperation(obj) {
  try {
    const line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, obj));
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n', { encoding: 'utf8' });
  } catch (err) {
    // swallow logging errors
    console.error('Failed to log thread-bridge operation', err.message);
  }
}

module.exports = { createThread, nextPartNumber, buildThreadUrl, autoTitleFromSummary, logOperation };
