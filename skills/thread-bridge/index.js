const path = require('path');
const fetcher = require('./lib/fetcher');
const summarizer = require('./lib/summarizer');
const creator = require('./lib/creator');
const linker = require('./lib/linker');

// Allowed forum channel IDs (from subagent context)
const ALLOWED_FORUMS = new Set([
  '1475021817168134144',
  '1475021931446272151',
  '1475021987628712029',
  '1475022122861461606',
  '1475373158260277298',
  '1476018965284261908',
  '1477543809905721365',
  '1478859644633088064',
  '1475021875024494612'
]);
const GUILD_ID = '1474997926919929927';

function ensureCallerGuild(opts) {
  // Enforce that the caller provides their guild context and it matches the allowed guild
  if (!opts || !opts.callerGuildId) {
    throw new Error('Missing callerGuildId in options — operation not permitted');
  }
  if (String(opts.callerGuildId) !== GUILD_ID) {
    throw new Error('Caller not in permitted guild');
  }
}

async function refreshThread(sourceThreadId, options = {}) {
  ensureCallerGuild(options);

  const opts = Object.assign({
    messageCount: 150,
    summaryStyle: 'detailed',
    postHandoffInSource: true,
    archiveSource: false,
    threadTitle: undefined,
    targetForum: undefined
  }, options);

  // Fetch messages
  const messages = await fetcher.fetchMessages(sourceThreadId, opts.messageCount);

  // Summarize
  const promptOpts = { style: opts.summaryStyle, mode: 'refresh' };
  const summary = await summarizer.summarize(messages, promptOpts);

  // Determine target forum
  const forum = opts.targetForum || (await fetcher.getForumForThread(sourceThreadId));
  if (!ALLOWED_FORUMS.has(String(forum))) {
    throw new Error('Target forum not allowed');
  }

  // Title
  let title = opts.threadTitle;
  if (!title) {
    const sourceTitle = await fetcher.getThreadTitle(sourceThreadId);
    const part = await creator.nextPartNumber(forum, sourceTitle);
    title = `${sourceTitle} — Part ${part}`;
  }

  // Create thread
  const createResp = await creator.createThread(forum, title, summary);

  // Post handoff in source
  if (opts.postHandoffInSource) {
    const link = createResp.url || creator.buildThreadUrl(forum, createResp.id);
    await linker.postHandoff(sourceThreadId, link, createResp.id);
  }

  // Archive source if requested (require confirmation)
  if (opts.archiveSource) {
    // require explicit confirmation flag to be true
    if (opts.confirmArchive !== true) {
      throw new Error('archiveSource requested but no explicit confirmation (confirmArchive:true) provided');
    }
    await fetcher.archiveThread(sourceThreadId);
  }

  // Log operation
  await creator.logOperation({ type: 'refresh', sourceThreadId, newThreadId: createResp.id, forum, options: opts });

  return { newThreadId: createResp.id, newThreadUrl: createResp.url };
}

async function splitThread(sourceThreadId, newTitle, forumChannelId, options = {}) {
  ensureCallerGuild(options);

  const opts = Object.assign({
    messageCount: 15,
    summaryStyle: 'brief',
    postHandoffInSource: true,
    archiveSource: false
  }, options);

  const messages = await fetcher.fetchMessages(sourceThreadId, opts.messageCount);
  const promptOpts = { style: opts.summaryStyle, mode: 'split', titleHint: newTitle };
  const summary = await summarizer.summarize(messages, promptOpts);

  const forum = forumChannelId || (await fetcher.getForumForThread(sourceThreadId));
  if (!ALLOWED_FORUMS.has(String(forum))) {
    throw new Error('Target forum not allowed');
  }

  const title = newTitle || (await creator.autoTitleFromSummary(summary));
  const createResp = await creator.createThread(forum, title, summary);

  if (opts.postHandoffInSource) {
    const link = createResp.url || creator.buildThreadUrl(forum, createResp.id);
    await linker.postSplitLink(sourceThreadId, link, createResp.id, title);
  }

  await creator.logOperation({ type: 'split', sourceThreadId, newThreadId: createResp.id, forum, options: opts });

  return { newThreadId: createResp.id };
}

async function freshThread(forumChannelId, title, seedText, options = {}) {
  ensureCallerGuild(options);

  const opts = Object.assign({
    messageCount: 0,
    postHandoffInSource: false,
    archiveSource: false
  }, options);

  const forum = forumChannelId;
  if (!ALLOWED_FORUMS.has(String(forum))) {
    throw new Error('Target forum not allowed');
  }

  let initialMessage = '';
  if (seedText) initialMessage = seedText;
  else if (opts.messageCount && opts.messageCount > 0) {
    // no source thread provided — just leave blank
    initialMessage = '';
  }

  const createResp = await creator.createThread(forum, title, initialMessage);

  await creator.logOperation({ type: 'fresh', newThreadId: createResp.id, forum, options: opts });

  return { newThreadId: createResp.id };
}

module.exports = { refreshThread, splitThread, freshThread };
