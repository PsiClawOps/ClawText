const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);

async function postHandoff(sourceThreadId, newThreadUrl, newThreadId) {
  const note = `🔀 Continuing in ${newThreadUrl}`;
  const cmd = `openclaw message --action=send --channel=${sourceThreadId} --message=${JSON.stringify(note)}`;
  try {
    await execp(cmd);
    return true;
  } catch (err) {
    throw new Error(`Failed to post handoff: ${err.message}`);
  }
}

async function postSplitLink(sourceThreadId, newThreadUrl, newThreadId, title) {
  const note = `🔀 A new thread was created: ${title} — ${newThreadUrl}`;
  const cmd = `openclaw message --action=send --channel=${sourceThreadId} --message=${JSON.stringify(note)}`;
  try {
    await execp(cmd);
    return true;
  } catch (err) {
    throw new Error(`Failed to post split link: ${err.message}`);
  }
}

module.exports = { postHandoff, postSplitLink };
