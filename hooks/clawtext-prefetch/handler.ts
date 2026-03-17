import fs from 'fs';
import os from 'os';
import path from 'path';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const PREFETCH_STATE_PATH = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'prefetch-state.json');
const STALE_MS = 60 * 60 * 1000;

function isBootstrapEvent(event: { type?: string; action?: string }): boolean {
  const type = String(event?.type || '');
  const action = String(event?.action || '');

  if (type === 'agent' && action === 'bootstrap') return true;
  if (type === 'session' && action === 'start') return true;
  if (action === 'bootstrap' || action === 'start') return true;

  return false;
}

function isStateStale(nowMs = Date.now()): boolean {
  try {
    if (!fs.existsSync(PREFETCH_STATE_PATH)) return true;
    const parsed = JSON.parse(fs.readFileSync(PREFETCH_STATE_PATH, 'utf8')) as { timestamp?: number };
    if (typeof parsed?.timestamp !== 'number') return true;
    return nowMs - parsed.timestamp > STALE_MS;
  } catch {
    return true;
  }
}

const handler = async (event: { type?: string; action?: string }) => {
  try {
    if (!isBootstrapEvent(event)) return;
    if (!isStateStale()) return;

    void import('../../scripts/discord-prefetch.mjs')
      .then((mod) => mod.runPrefetch?.({}))
      .catch((err) => {
        if (process.env.DEBUG_CLAWTEXT) {
          console.error('[clawtext-prefetch] prefetch error:', err instanceof Error ? err.message : String(err));
        }
      });
  } catch {
    // never block bootstrap
  }
};

export default handler;
