import fs from 'fs';
import path from 'path';
import { getClawTextSessionTopicMapPath } from './runtime-paths.js';
const DEFAULT_MAP = {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    bindings: {},
};
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
export function sanitizeTopicName(raw) {
    const normalized = String(raw ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return normalized || 'general';
}
export function loadSessionTopicMap(workspacePath) {
    const mapPath = getClawTextSessionTopicMapPath(workspacePath);
    try {
        if (!fs.existsSync(mapPath))
            return { ...DEFAULT_MAP };
        const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        const bindings = raw.bindings && typeof raw.bindings === 'object' ? raw.bindings : {};
        return {
            version: Number.isFinite(raw.version) ? Number(raw.version) : 1,
            updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
            bindings,
        };
    }
    catch {
        return { ...DEFAULT_MAP };
    }
}
export function saveSessionTopicMap(workspacePath, map) {
    const mapPath = getClawTextSessionTopicMapPath(workspacePath);
    ensureDir(mapPath);
    const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        bindings: Object.fromEntries(Object.entries(map.bindings ?? {})
            .filter(([key, value]) => Boolean(key && String(value).trim()))
            .map(([key, value]) => [key, sanitizeTopicName(String(value))])),
    };
    fs.writeFileSync(mapPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
export function bindSessionToTopic(workspacePath, sessionKey, topicName, options) {
    const normalizedSession = String(sessionKey ?? '').trim();
    if (!normalizedSession)
        return loadSessionTopicMap(workspacePath);
    const topic = sanitizeTopicName(topicName);
    const map = loadSessionTopicMap(workspacePath);
    map.bindings[normalizedSession] = topic;
    const channelId = String(options?.channelId ?? '').trim();
    if (channelId) {
        map.bindings[`channel:${channelId}`] = topic;
    }
    saveSessionTopicMap(workspacePath, map);
    return map;
}
export function resolveTopicForSession(workspacePath, context) {
    const map = loadSessionTopicMap(workspacePath);
    const sessionKey = String(context.sessionKey ?? '').trim();
    if (sessionKey && map.bindings[sessionKey])
        return sanitizeTopicName(map.bindings[sessionKey]);
    const channelId = String(context.channelId ?? '').trim();
    if (channelId && map.bindings[`channel:${channelId}`]) {
        return sanitizeTopicName(map.bindings[`channel:${channelId}`]);
    }
    return null;
}
//# sourceMappingURL=session-topic-map.js.map