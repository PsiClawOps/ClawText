const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);

// Minimal fetcher using OpenClaw CLI. This is a best-effort implementation
// and expects the host environment to have the `openclaw` CLI available.

async function fetchMessages(threadId, limit = 100) {
  // Use openclaw message action=read
  // CLI: openclaw message --action=read --channel=<threadId> --limit=<n>
  const cmd = `openclaw message --action=read --channel=${threadId} --limit=${Math.min(limit,500)}`;
  try {
    const { stdout } = await execp(cmd, { timeout: 20000 });
    // The CLI may return JSON. Try parse, otherwise return raw.
    try {
      const parsed = JSON.parse(stdout);
      // Filter out bot/system messages and attachments-only
      const msgs = (parsed.messages || parsed).filter(m => {
        if (!m) return false;
        if (m.type && (m.type === 'system' || m.type === 'bot')) return false;
        if (m.author && m.author.bot) return false;
        if (!m.content || (typeof m.content === 'string' && m.content.trim() === '')) return false;
        return true;
      }).map(m => ({ id: m.id, author: m.author && m.author.username, content: m.content, ts: m.ts }));
      return msgs;
    } catch (e) {
      // Fallback: return raw text lines
      return stdout.split('\n').slice(-limit);
    }
  } catch (err) {
    throw new Error(`Failed to fetch messages: ${err.message}`);
  }
}

async function getForumForThread(threadId) {
  // Query thread metadata
  const cmd = `openclaw message --action=info --channel=${threadId}`;
  try {
    const { stdout } = await execp(cmd, { timeout: 8000 });
    const parsed = JSON.parse(stdout);
    return parsed.channel && parsed.channel.parent_id || parsed.guild_id;
  } catch (err) {
    // Best-effort fallback
    return null;
  }
}

async function getThreadTitle(threadId) {
  const cmd = `openclaw message --action=info --channel=${threadId}`;
  try {
    const { stdout } = await execp(cmd, { timeout: 8000 });
    const parsed = JSON.parse(stdout);
    return parsed.channel && parsed.channel.name || `Thread ${threadId}`;
  } catch (err) {
    return `Thread ${threadId}`;
  }
}

async function archiveThread(threadId) {
  const cmd = `openclaw message --action=archive --channel=${threadId}`;
  try {
    await execp(cmd, { timeout: 8000 });
    return true;
  } catch (err) {
    throw new Error(`Failed to archive thread: ${err.message}`);
  }
}

module.exports = { fetchMessages, getForumForThread, getThreadTitle, archiveThread };
