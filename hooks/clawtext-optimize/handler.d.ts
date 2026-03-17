type PluginHookBeforePromptBuildEvent = {
    prompt: string;
    messages: unknown[];
};
type PluginHookBeforePromptBuildResult = {
    systemPrompt?: string;
    prependContext?: string;
    prependSystemContext?: string;
    appendSystemContext?: string;
};
type PluginHookAgentContext = {
    config?: unknown;
    workspaceDir?: string;
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    messageChannel?: string;
};
declare const handler: (event: PluginHookBeforePromptBuildEvent, ctx: PluginHookAgentContext) => Promise<PluginHookBeforePromptBuildResult | void>;
export default handler;
//# sourceMappingURL=handler.d.ts.map