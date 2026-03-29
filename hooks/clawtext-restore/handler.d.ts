declare const handler: (event: {
    type: string;
    action: string;
    sessionKey: string;
    context: Record<string, unknown>;
    messages: string[];
}) => Promise<void>;
export default handler;
//# sourceMappingURL=handler.d.ts.map