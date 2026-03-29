export interface TopicAnchorData {
    topic: string;
    meta: Record<string, string>;
    currentStatus: string;
    keyDecisions: string[];
    history: string[];
}
export interface TopicAnchorSyncParams {
    topic: string;
    sessionKey: string;
    channelId?: string;
    channelName?: string;
    trigger: 'rolling' | 'interval' | 'reset';
    messagesSince: number;
    recentContent: string[];
    lastSender?: string;
}
export declare function loadTopicAnchor(workspacePath: string, topic: string): TopicAnchorData | null;
export declare function serializeTopicAnchor(anchor: TopicAnchorData): string;
export declare function saveTopicAnchor(workspacePath: string, anchor: TopicAnchorData): string;
export declare function syncTopicAnchor(workspacePath: string, params: TopicAnchorSyncParams): {
    filePath: string;
    anchor: TopicAnchorData;
};
export declare function formatTopicAnchorForSlot(anchor: TopicAnchorData, options?: {
    maxStatusLines?: number;
    maxDecisionLines?: number;
    maxHistoryLines?: number;
}): string;
//# sourceMappingURL=topic-anchor.d.ts.map