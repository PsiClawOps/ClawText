export type ClawTextStateEnv = 'dev' | 'prod';
export declare function getClawTextStateRoot(workspacePath: string, env?: ClawTextStateEnv): string;
export declare function getClawTextProdStateRoot(workspacePath: string): string;
export declare function getClawTextDevStateRoot(workspacePath: string): string;
export declare function getClawTextCacheDir(workspacePath: string): string;
export declare function getClawTextOperationalDir(workspacePath: string): string;
export declare function getClawTextIngestStateDir(workspacePath: string): string;
export declare function getClawTextEvalDevDir(workspacePath: string): string;
export declare function getClawTextLibraryDir(workspacePath: string): string;
export declare function getClawTextLibraryCollectionsDir(workspacePath: string): string;
export declare function getClawTextLibraryEntriesDir(workspacePath: string): string;
export declare function getClawTextLibraryOverlaysDir(workspacePath: string): string;
export declare function getClawTextLibraryIndexesDir(workspacePath: string): string;
export declare function getClawTextLibrarySnapshotsDir(workspacePath: string): string;
export declare function getClawTextLibraryManifestsDir(workspacePath: string): string;
export declare function getClawTextSessionTopicMapPath(workspacePath: string): string;
export declare function getClawTextTopicAnchorsDir(workspacePath: string): string;
//# sourceMappingURL=runtime-paths.d.ts.map