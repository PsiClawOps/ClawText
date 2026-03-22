<repository_context>
  <name>@psiclawops/clawtext</name>
  <description>Layered memory and continuity platform for OpenClaw agents: working memory, ingest, operational learning, ClawBridge transfer, and trusted documentation library retrieval.</description>
  <stats>
    <files>91</files>
    <functions>834</functions>
    <modules>20</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
<commands>
  <command>
    <run>npm run dev</run>
    <executes>tsc --watch</executes>
  </command>
  <command>
    <run>npm run build</run>
    <executes>tsc && node scripts/add-js-extensions.js</executes>
  </command>
  <command>
    <run>npm run test</run>
    <executes>npm run test:content-types && npm run test:integrations</executes>
  </command>
</commands>
  <module id="src">
    <name>Utils</name>
    <location>src/**</location>
    <purpose>Read json; Parse frontmatter; Ensure string array</purpose>
    <entry_points>
      <function signature="ClawTextLibraryIndex.build() [src/library-index.ts:103]" purpose="Build" />
      <function signature="runClawptimization(prompt, messages, channelId, sessionKey) [src/index.ts:236]" purpose="Run clawptimization" />
      <function signature="ActivePruner.prune(slots, pressure) [src/active-pruning.ts:120]" purpose="Prune" />
      <function signature="DecisionTreeManager.extractFromJournal(journalRecords) [src/decision-tree.ts:326]" purpose="Extract from journal" />
      <function signature="async ClawTextLibraryIngest.ingestCollection(manifest, options?) [src/library-ingest.ts:71]" purpose="Ingest collection" />
    </entry_points>
    <key_internal_functions>
      <function name="getClawTextLibraryDir" callers="7" purpose="Get claw text library dir" />
      <function name="nowIso" callers="6" purpose="Now iso" />
      <function name="getClawTextProdStateRoot" callers="6" purpose="Get claw text prod state root" />
      <function name="getClawTextProdStateRoot" callers="6" purpose="Get claw text prod state root" />
      <function name="getClawTextLibraryDir" callers="6" purpose="Get claw text library dir" />
    </key_internal_functions>
    <depends_on>Logging & Caching</depends_on>
  </module>
  <module id="reflect">
    <name>Logging & Caching</name>
    <location>src/reflect/**, src/slots/**</location>
    <purpose>Resolve OpenRouter API key; Config path; Memory cache path</purpose>
    <entry_points>
      <function signature="resolveSlotTemplate(ctx, selector) [src/slots/slot-api.ts:367]" purpose="Resolve slot template" />
      <function signature="setSessionStatus(workspacePath, sessionId, status, options?) [src/slots/sessionMatrix.ts:450]" purpose="Set session status" />
      <function signature="async logReflectCall(entry) [src/reflect/telemetry.ts:82]" purpose="Log a reflect call to the telemetry JSONL" />
      <function signature="upsertAdvisor(workspacePath, advisor) [src/slots/advisor.ts:282]" purpose="Upsert advisor" />
      <function signature="upsertRoutingRule(workspacePath, rule) [src/slots/advisor.ts:292]" purpose="Upsert routing rule" />
    </entry_points>
    <key_internal_functions>
      <function name="loadSessionMatrixState" callers="9" purpose="Load session matrix state" />
      <function name="loadAdvisorState" callers="5" purpose="Load advisor state" />
      <function name="matrixDir" callers="5" purpose="Matrix dir" />
      <function name="loadConfig" callers="4" purpose="Load reflect configuration" />
      <function name="resolveCurrentSession" callers="4" purpose="Resolve current session" />
    </key_internal_functions>
  </module>
  <module id="bin">
    <name>Search (Bin)</name>
    <location>bin/**, src/ingest/**</location>
    <purpose>Parse command-line arguments; Display help message; Main CLI handler</purpose>
    <entry_points>
      <function signature="async main() [bin/discord.js:469]" purpose="Main" />
      <function signature="async main() [bin/ingest.js:98]" purpose="Main CLI handler" />
      <function signature="ProgressBar.constructor(total, width?) [bin/discord.js:22]" purpose="Progress bar.constructor (total, width)" />
      <function signature="ProgressBar.update(current, label?) [bin/discord.js:29]" purpose="Update" />
      <function signature="ProgressBar.finish(label?) [bin/discord.js:44]" purpose="Finish" />
    </entry_points>
    <key_internal_functions>
      <function name="parseArgs" callers="1" purpose="Parse command-line arguments" />
      <function name="showDiscordHelp" callers="1" purpose="Show help for Discord commands" />
      <function name="cmdDescribeForum" callers="1" purpose="Command: describe-forum" />
      <function name="cmdFetchDiscord" callers="1" purpose="Command: fetch-discord" />
      <function name="parseArgs" callers="1" purpose="Parse command-line arguments" />
    </key_internal_functions>
  </module>
  <module id="ingest">
    <name>CLI (Ingest)</name>
    <location>src/ingest/**, bin/**</location>
    <purpose>Parse command-line arguments; Show help for Discord commands; Command: describe-forum</purpose>
    <entry_points>
      <function signature="DiscordAdapter.constructor(options?) [src/ingest/adapters/discord.js:14]" purpose="Discord adapter.constructor (options)" />
      <function signature="async DiscordAdapter.authenticate() [src/ingest/adapters/discord.js:39]" purpose="Authenticate with Discord" />
      <function signature="async DiscordAdapter.disconnect() [src/ingest/adapters/discord.js:48]" purpose="Cleanup: logout from Discord" />
      <function signature="async DiscordAdapter.describeForumStructure(forumId) [src/ingest/adapters/discord.js:59]" purpose="Get lightweight forum metadata without fetching messages" />
      <function signature="async DiscordAdapter.fetchForumHierarchy(forumId) [src/ingest/adapters/discord.js:99]" purpose="Fetch forum hierarchy: list all posts without fetching messages" />
    </entry_points>
  </module>
  <module id="hooks-clawtext-checkpoint">
    <name>Authentication & API</name>
    <location>hooks/**, src/**</location>
    <purpose>Clamp; Ensure dir; Sanitize topic name</purpose>
    <entry_points>
      <function signature="async handler(event) [hooks/clawtext-checkpoint/handler.ts:142]" purpose="── Hook handler ──────────────────────────────────────────────────────────────" />
      <function signature="async handler(event) [hooks/clawtext-prune/handler.ts:170]" purpose="Handler" />
      <function signature="isFilteredSession(ctx, content?) [hooks/clawtext-checkpoint/handler.ts:99]" purpose="Is filtered session" />
    </entry_points>
    <key_internal_functions>
      <function name="getFilterReason" callers="2" purpose="Get filter reason" />
      <function name="ensureDir" callers="2" purpose="Ensure dir" />
      <function name="readState" callers="1" purpose="── State helpers ─────────────────────────────────────────────────────────────" />
      <function name="writeState" callers="1" purpose="Write state" />
      <function name="logDiagnostic" callers="1" purpose="Log diagnostic" />
    </key_internal_functions>
    <depends_on>Utils</depends_on>
  </module>
  <module id="hooks-clawtext-extract">
    <name>API (Hooks Clawtext Extract)</name>
    <location>hooks/clawtext-extract/**</location>
    <purpose>ClawText Auto-Extract Hook; Is filtered session</purpose>
    <entry_points>
      <function signature="async handler(event) [hooks/clawtext-extract/handler.ts:81]" purpose="Handler" />
    </entry_points>
    <key_internal_functions>
      <function name="isRawLog" callers="1" purpose="ClawText Auto-Extract Hook" />
      <function name="isFilteredSession" callers="1" purpose="Is filtered session" />
    </key_internal_functions>
  </module>
  <module id="hooks-clawtext-flush">
    <name>API (Hooks Clawtext Flush)</name>
    <location>hooks/clawtext-flush/**</location>
    <purpose>ClawText Session-End Flush Hook</purpose>
    <entry_points>
      <function signature="async handler(event) [hooks/clawtext-flush/handler.ts:22]" purpose="ClawText Session-End Flush Hook" />
    </entry_points>
  </module>
  <module id="hooks-clawtext-optimize">
    <name>API & Providers (Hooks Clawtext Optimize)</name>
    <location>hooks/clawtext-optimize/**</location>
    <purpose>Log diagnostic; Load config; Parse prompt sections</purpose>
    <entry_points>
      <function signature="async handler(event, ctx) [hooks/clawtext-optimize/handler.ts:220]" purpose="Handler" />
      <function signature="async handler(event, ctx) [hooks/clawtext-optimize/handler.js:158]" purpose="Handler" />
    </entry_points>
    <key_internal_functions>
      <function name="logDiagnostic" callers="1" purpose="Log diagnostic" />
      <function name="loadConfig" callers="1" purpose="Load config" />
      <function name="parsePromptSections" callers="1" purpose="Parse prompt sections" />
      <function name="inferSource" callers="1" purpose="Infer source" />
      <function name="composeOptimizedContext" callers="1" purpose="Compose optimized context" />
    </key_internal_functions>
    <depends_on>Utils</depends_on>
  </module>
  <module id="hooks-clawtext-prefetch">
    <name>API (Hooks Clawtext Prefetch)</name>
    <location>hooks/clawtext-prefetch/**</location>
    <purpose>Is bootstrap event; Is state stale</purpose>
    <entry_points>
      <function signature="async handler(event) [hooks/clawtext-prefetch/handler.ts:31]" purpose="Handler" />
    </entry_points>
    <key_internal_functions>
      <function name="isBootstrapEvent" callers="1" purpose="Is bootstrap event" />
      <function name="isStateStale" callers="1" purpose="Is state stale" />
    </key_internal_functions>
  </module>
  <module id="hooks-clawtext-restore">
    <name>API & Providers (Hooks Clawtext Restore)</name>
    <location>hooks/clawtext-restore/**</location>
    <purpose>Load scorer module; Load config; ── Read journal records for a channel from recent files ─...</purpose>
    <entry_points>
      <function signature="async handler(event) [hooks/clawtext-restore/handler.ts:142]" purpose="── Hook handler ──────────────────────────────────────────────────────────────" />
    </entry_points>
    <key_internal_functions>
      <function name="loadScorerModule" callers="1" purpose="Load scorer module" />
      <function name="loadConfig" callers="1" purpose="Load config" />
      <function name="readRecentJournalRecords" callers="1" purpose="── Read journal records for a channel from recent files ─────────────────────" />
      <function name="formatContextBlock" callers="1" purpose="── Format records as a compact context block, respecting byte budget ─────────" />
    </key_internal_functions>
  </module>
  <module id="cli">
    <name>CLI & Dashboard</name>
    <location>src/cli/**</location>
    <purpose>Out; Err; Cmd extraction strategies list</purpose>
    <entry_points>
      <function signature="async extractionCLI(args) [src/cli/extraction-cli.ts:124]" purpose="Extraction cli" />
      <function signature="async reflectCLI(args) [src/cli/extraction-cli.ts:241]" purpose="Reflect cli" />
      <function signature="iacCLI(args) [src/cli/extraction-cli.ts:475]" purpose="Iac cli" />
    </entry_points>
    <key_internal_functions>
      <function name="out" callers="17" purpose="Out" />
      <function name="err" callers="3" purpose="Err" />
      <function name="cmdPlan" callers="2" purpose="Cmd plan" />
      <function name="cmdExtractionStrategiesList" callers="1" purpose="Cmd extraction strategies list" />
      <function name="cmdExtractionMappingsShow" callers="1" purpose="Cmd extraction mappings show" />
    </key_internal_functions>
  </module>
  <module id="extraction">
    <name>Search & Blog</name>
    <location>src/extraction/**</location>
    <purpose>Extraction dir; Strategies dir; Get strategies path</purpose>
    <entry_points>
      <function signature="seedDefaultStrategies(workspacePath) [src/extraction/extraction-router.ts:181]" purpose="Seed default strategies if none exist" />
      <function signature="addTagFilter(workspacePath, filterId, filter) [src/extraction/tag-filters.ts:57]" purpose="Add tag filter" />
      <function signature="removeTagFilter(workspacePath, filterId) [src/extraction/tag-filters.ts:63]" purpose="Remove tag filter" />
      <function signature="isExtractionEnabled(workspacePath, topic) [src/extraction/extraction-router.ts:157]" purpose="Is extraction enabled" />
      <function signature="getExtractionConfig(workspacePath, topic) [src/extraction/extraction-router.ts:162]" purpose="Get extraction config" />
    </entry_points>
    <key_internal_functions>
      <function name="getStrategyForTopic" callers="4" purpose="Get strategy for topic" />
      <function name="loadTagFilters" callers="3" purpose="Load tag filters" />
      <function name="extractionDir" callers="2" purpose="Extraction dir" />
      <function name="strategiesDir" callers="2" purpose="Strategies dir" />
      <function name="getStrategiesPath" callers="2" purpose="Get strategies path" />
    </key_internal_functions>
  </module>
  <module id="fleet">
    <name>Config (Fleet)</name>
    <location>src/fleet/**</location>
    <purpose>──────────────────────────────────────────────; Get node config path; Get nodes path</purpose>
    <entry_points>
      <function signature="upsertNode(entry, stateRoot?) [src/fleet/index.ts:117]" purpose="──────────────────────────────────────────────" />
      <function signature="recordHeartbeat(hb, stateRoot?) [src/fleet/index.ts:133]" purpose="Record a heartbeat from a peer node." />
      <function signature="removeNode(nodeId, stateRoot?) [src/fleet/index.ts:163]" purpose="Remove a node from the registry." />
      <function signature="sweepStaleNodes(timeoutMs?, stateRoot?) [src/fleet/index.ts:186]" purpose="Check if a node should be marked offline (no heartbeat for timeoutMs)." />
      <function signature="getOnlineNodes(stateRoot?) [src/fleet/index.ts:174]" purpose="Get nodes that are online or degraded (reachable)." />
    </entry_points>
    <key_internal_functions>
      <function name="loadNodeRegistry" callers="6" purpose="Load node registry" />
      <function name="saveNodeRegistry" callers="4" purpose="Save node registry" />
      <function name="getFleetRoot" callers="3" purpose="──────────────────────────────────────────────" />
      <function name="getNodesPath" callers="2" purpose="Get nodes path" />
      <function name="loadJSON" callers="2" purpose="──────────────────────────────────────────────" />
    </key_internal_functions>
  </module>
  <module id="integrations">
    <name>Providers (Integrations)</name>
    <location>src/integrations/**</location>
    <purpose>──────────────────────────────────────────────; Build advisor context block; Build session context block</purpose>
    <entry_points>
      <function signature="async renderCouncilPromptBlock(template, options) [src/integrations/clawcouncil.ts:225]" purpose="Convenience: expand a prompt template string with full council context." />
      <function signature="renderClawDashPanel(ctx, options?) [src/integrations/clawdash.ts:27]" purpose="Render claw dash panel" />
    </entry_points>
    <key_internal_functions>
      <function name="resolveWorkspacePath" callers="2" purpose="──────────────────────────────────────────────" />
      <function name="buildAdvisorContextBlock" callers="1" purpose="Build advisor context block" />
      <function name="buildSessionContextBlock" callers="1" purpose="Build session context block" />
      <function name="renderCouncilContext" callers="1" purpose="──────────────────────────────────────────────" />
    </key_internal_functions>
  </module>
  <module id="peer">
    <name>Notifications</name>
    <location>src/peer/**</location>
    <purpose>──────────────────────────────────────────────; Push transactions to a single peer; Get peer's current record status</purpose>
    <entry_points>
      <function signature="async syncWithPeers(stateRoot?) [src/peer/index.ts:221]" purpose="──────────────────────────────────────────────" />
      <function signature="async sendHeartbeat(peer, hb) [src/peer/index.ts:149]" purpose="Send heartbeat to a peer." />
      <function signature="handleInboundHeartbeat(hb, stateRoot?) [src/peer/index.ts:206]" purpose="Handle an inbound heartbeat from a peer." />
    </entry_points>
    <key_internal_functions>
      <function name="fetchJSON" callers="4" purpose="──────────────────────────────────────────────" />
      <function name="pushToPeer" callers="1" purpose="Push transactions to a single peer." />
      <function name="getPeerStatus" callers="1" purpose="Get peer's current record status." />
      <function name="pullFromPeer" callers="1" purpose="Pull missing transactions from a peer." />
      <function name="handleInboundPush" callers="1" purpose="──────────────────────────────────────────────" />
    </key_internal_functions>
  </module>
  <module id="permissions">
    <name>Project Management (Permissions)</name>
    <location>src/permissions/**</location>
    <purpose>──────────────────────────────────────────────; Get defaults path; Get roles dir</purpose>
    <entry_points>
      <function signature="canAccess(ctx, workspacePath?) [src/permissions/index.ts:246]" purpose="Check if a user can perform an operation." />
    </entry_points>
    <key_internal_functions>
      <function name="loadJSON" callers="4" purpose="──────────────────────────────────────────────" />
      <function name="getPermissionsRoot" callers="1" purpose="──────────────────────────────────────────────" />
      <function name="getDefaultsPath" callers="1" purpose="Get defaults path" />
      <function name="getRolesDir" callers="1" purpose="Get roles dir" />
      <function name="getVaultsDir" callers="1" purpose="Get vaults dir" />
    </key_internal_functions>
  </module>
  <module id="record">
    <name>Search (Record)</name>
    <location>src/record/**</location>
    <purpose>──────────────────────────────────────────────; Get transactions path; Get index path</purpose>
    <entry_points>
      <function signature="verifyChain(stateRoot?) [src/record/index.ts:193]" purpose="Verify the hash chain integrity." />
      <function signature="getRecordStatus(stateRoot?) [src/record/index.ts:235]" purpose="Get record status." />
      <function signature="recordMemoryExtracted(sessionId, memories, options?) [src/record/index.ts:245]" purpose="──────────────────────────────────────────────" />
      <function signature="recordMemoryPromoted(memoryId, fromLane, toLane, reason, options?) [src/record/index.ts:253]" purpose="Record memory promoted" />
      <function signature="recordSessionCheckpoint(sessionId, summary, openLoops, decisions, options?) [src/record/index.ts:263]" purpose="Record session checkpoint" />
    </entry_points>
    <key_internal_functions>
      <function name="getRecordRoot" callers="4" purpose="──────────────────────────────────────────────" />
      <function name="appendTransaction" callers="4" purpose="──────────────────────────────────────────────" />
      <function name="getTransactionsPath" callers="2" purpose="Get transactions path" />
      <function name="getIndexPath" callers="2" purpose="Get index path" />
      <function name="hashPayload" callers="2" purpose="──────────────────────────────────────────────" />
    </key_internal_functions>
  </module>
  <module id="scripts">
    <name>Dashboard</name>
    <location>scripts/**</location>
    <purpose>Add js extensions; Generate a deterministic deduplication hash for memory co...; Generate a unique memory ID from source + content hash</purpose>
    <entry_points>
      <function signature="splitIntoChunks(content, sourceFile) [scripts/build-clusters.js:209]" purpose="Split into chunks" />
      <function signature="generateReport() [scripts/memory-health-report.js:288]" purpose="Generate report" />
      <function signature="async main() [scripts/validate-rag.js:138]" purpose="Main" />
      <function signature="loadApiMemories() [scripts/build-clusters.js:308]" purpose="Load API memories (JSON files from memoryapi-memories)." />
      <function signature="addOrMergeMemory(input, mentionIncrement?) [scripts/build-clusters.js:360]" purpose="Add or merge memory" />
    </entry_points>
    <key_internal_functions>
      <function name="dedupeHash" callers="2" purpose="Generate a deterministic deduplication hash for memory content" />
      <function name="memoryId" callers="2" purpose="Generate a unique memory ID from source + content hash" />
      <function name="extractCreatedAt" callers="1" purpose="Try to extract a date from sourceFile name (YYYY-MM-DD.md pattern)" />
      <function name="tokenize" callers="1" purpose="Tokenize" />
      <function name="topKeywords" callers="1" purpose="Top keywords" />
    </key_internal_functions>
  </module>
  <module id="skills-clawbridge">
    <name>CLI (Skills Clawbridge)</name>
    <location>skills/clawbridge/**, skills/clawbridge/bin/**</location>
    <purpose>List templates; List modes; Get template path</purpose>
    <entry_points>
      <function signature="main() [skills/clawbridge/bin/clawbridge.js:760]" purpose="Main" />
      <function signature="listTemplates() [skills/clawbridge/index.js:26]" purpose="List templates" />
      <function signature="listModes() [skills/clawbridge/index.js:30]" purpose="List modes" />
      <function signature="getTemplatePath(name) [skills/clawbridge/index.js:34]" purpose="Get template path" />
    </entry_points>
    <key_internal_functions>
      <function name="normalizeIncomingTarget" callers="4" purpose="Normalize incoming target" />
      <function name="runOpenclaw" callers="4" purpose="Run openclaw" />
      <function name="assertCommandSuccess" callers="4" purpose="Assert command success" />
      <function name="uniq" callers="4" purpose="Uniq" />
      <function name="clampInt" callers="4" purpose="Clamp int" />
    </key_internal_functions>
  </module>
  <module id="providers">
    <name>Providers</name>
    <location>src/providers/**</location>
    <purpose>Unique domains; Infer relevant domains; Format advisor block</purpose>
    <entry_points>
      <function signature="AdvisorProvider.fill(ctx, budgetBytes) [src/providers/advisor-provider.ts:52]" purpose="Fill" />
      <function signature="ClawBridgeProvider.fill(_ctx, budgetBytes) [src/providers/clawbridge-provider.ts:115]" purpose="Fill" />
      <function signature="CrossSessionProvider.fill(ctx, budgetBytes) [src/providers/cross-session-provider.ts:231]" purpose="Fill" />
      <function signature="MidHistoryProvider.fill(ctx, budgetBytes) [src/providers/mid-history-provider.ts:102]" purpose="Fill" />
      <function signature="CrossSessionProvider.available(ctx) [src/providers/cross-session-provider.ts:226]" purpose="Available" />
    </entry_points>
    <key_internal_functions>
      <function name="uniqueDomains" callers="2" purpose="Unique domains" />
      <function name="discoverRecentShortHandoffs" callers="2" purpose="Discover recent short handoffs" />
      <function name="readRecentJournalRecords" callers="2" purpose="Read recent journal records" />
      <function name="collectAwarenessEntries" callers="2" purpose="Collect awareness entries" />
      <function name="estimateRecentCount" callers="2" purpose="Estimate recent count" />
    </key_internal_functions>
  </module>
</modules>

## File Import Graph

Which files import which — useful for understanding data flow.

### Utils
- `src/index.ts` → `src/plugin.ts`, `src/rag.ts`, `src/clawptimization.ts`, `src/prompt-compositor.ts`, `src/providers/topic-anchor-provider.ts`, `src/providers/advisor-provider.ts`, `src/providers/session-matrix-provider.ts`, `src/providers/extraction-provider.ts`, `src/injected-context.ts`, `src/agent-identity.ts`, `src/slots/identity-anchor-provider.ts`
- `src/library-index.ts` → `src/library.ts`, `src/runtime-paths.ts`
- `src/library-ingest.ts` → `src/library.ts`, `src/library-index.ts`, `src/runtime-paths.ts`
- `src/library.ts` → `src/runtime-paths.ts`
- `src/rag.ts` → `src/runtime-paths.ts`, `src/injected-context.ts`
- `src/hot-cache.js` → `src/runtime-paths.js`
- `src/memory.js` → `src/hot-cache.js`

### Authentication & API
- `hooks/clawtext-checkpoint/handler.ts` → `src/session-topic-map.ts`, `src/topic-anchor.ts`
- `hooks/clawtext-prune/handler.ts` → `src/active-pruning.ts`, `src/context-pressure.ts`, `src/injected-context.ts`

### API & Providers (Hooks Clawtext Optimize)
- `hooks/clawtext-optimize/handler.ts` → `src/clawptimization.ts`, `src/prompt-compositor.ts`, `src/providers/topic-anchor-provider.ts`, `src/injected-context.ts`
- `hooks/clawtext-optimize/handler.js` → `src/clawptimization.ts`, `src/prompt-compositor.ts`

### Logging & Caching
- `src/slots/reflect-slot-provider.ts` → `src/reflect/index.ts`

### unknown
- `plugin.js` → `src/rag.js`

### Search (Bin)
- `bin/discord.js` → `src/ingest/adapters/discord.js`, `src/ingest/agent-runner.js`, `src/ingest/index.js`
- `bin/ingest.js` → `src/ingest/index.js`
- `src/ingest/agent-runner.js` → `src/ingest/adapters/discord.js`


