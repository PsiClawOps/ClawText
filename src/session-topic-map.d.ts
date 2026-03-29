export interface SessionTopicMap {
    version: number;
    updatedAt: string;
    bindings: Record<string, string>;
}
export declare function sanitizeTopicName(raw: string): string;
export declare function loadSessionTopicMap(workspacePath: string): SessionTopicMap;
export declare function saveSessionTopicMap(workspacePath: string, map: SessionTopicMap): void;
export declare function bindSessionToTopic(workspacePath: string, sessionKey: string, topicName: string, options?: {
    channelId?: string;
}): SessionTopicMap;
export declare function resolveTopicForSession(workspacePath: string, context: {
    sessionKey?: string;
    channelId?: string;
}): string | null;
//# sourceMappingURL=session-topic-map.d.ts.map