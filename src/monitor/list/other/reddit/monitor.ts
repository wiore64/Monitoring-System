import crypto from "node:crypto";

import { CONFIG as GLOBAL_CONFIG } from "#root/config.js";
import config from "#data/other/reddit/monitor-config.json" with { type: "json" };
import state from "#data/other/reddit/monitor-state.json" with { type: "json" };
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

import { buildNewPostPayload } from "./payload-builder.js";

const LOG_NAME = "monitors/other/reddit";
const MONITOR_STATE_PATH = "./data/other/reddit/monitor-state.json";
const REDDIT_FEEDS_PATH = "./data/other/reddit/reddit-feeds.json";

const SUBREDDITS = {
  filian: {
    name: "filian",
    url: "https://www.reddit.com/r/filian/new/.json",
  },
  wall: {
    name: "THE\\_WALL\\_",
    url: "https://www.reddit.com/r/THE_WALL_/new/.json",
  },
} as const;

type SubredditKey = keyof typeof SUBREDDITS;

export type MonitorContext = {
  timeoutMs: number;
};

type RedditResponse = {
  data: {
    children: {
      data: {
        author: string;
        title: string;
        created: number;
        permalink: string;
      };
    }[];
  };
};

export type RedditPost = {
  title: string;
  author: string;
  timestamp: number;
  link: string;
  hash: string;
};

type RedditFeed = {
  posts: RedditPost[];
  totalHash: string;
};

type RedditFeeds = {
  [K in SubredditKey]: RedditFeed;
};

type UpdatedRedditFeeds = {
  [K in SubredditKey]?: {
    posts: RedditPost[];
  };
};

type ComparisonResult =
  | {
      hasUpdatedFeeds: true;
      feeds: UpdatedRedditFeeds;
    }
  | {
      hasUpdatedFeeds: false;
    };

export async function run(
  ctx: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const previousFeeds = readJsonFile<RedditFeeds>(REDDIT_FEEDS_PATH);
  const latestFeeds = await fetchRedditFeeds(GLOBAL_CONFIG.redditAuth, ctx.timeoutMs);

  if (!state.isInitialized) {
    initializeMonitor(latestFeeds, traceId);
    return ctx;
  }

  const result = compareLatestPosts(previousFeeds, latestFeeds);

  if (!result.hasUpdatedFeeds) {
    return ctx;
  }

  await reportNewPosts(result.feeds, config["channel-id"], traceId);
  writeJsonFile(REDDIT_FEEDS_PATH, latestFeeds);

  return ctx;
}

async function fetchRedditFeeds(credentials: object, timeoutMs: number): Promise<RedditFeeds> {
  const [filian, wall] = await Promise.all([
    fetchRedditFeed(SUBREDDITS.filian.url, credentials, timeoutMs),
    fetchRedditFeed(SUBREDDITS.wall.url, credentials, timeoutMs),
  ]);

  return {
    filian,
    wall,
  };
}

async function fetchRedditFeed(
  url: string,
  credentials: object,
  timeoutMs: number,
): Promise<RedditFeed> {
  const response = await fetchUrl(url, timeoutMs, {
    headers: credentials,
  });

  if (!response.success) {
    throw response.error;
  }

  const feedData = ((await response.data.json()) as RedditResponse).data;
  const posts: RedditPost[] = [];

  for (const post of feedData.children) {
    const postData = post.data;

    posts.push({
      title: postData.title,
      author: postData.author,
      timestamp: postData.created * 1000,
      link: `https://reddit.com${postData.permalink}`,
      hash: crypto.hash(
        "sha256",
        `${postData.author}${postData.title}${postData.permalink}${postData.created}`,
      ),
    });
  }

  return {
    posts,
    totalHash: posts.map((post) => post.hash).join(""),
  };
}

function initializeMonitor(latestFeeds: RedditFeeds, traceId: string): void {
  writeJsonFile(REDDIT_FEEDS_PATH, latestFeeds);

  state.isInitialized = true;
  writeJsonFile(MONITOR_STATE_PATH, state);

  debug(LOG_NAME, "Initialized.", traceId);
}

function compareLatestPosts(
  previousFeeds: RedditFeeds,
  latestFeeds: RedditFeeds,
): ComparisonResult {
  const updatedFeeds: UpdatedRedditFeeds = {};

  for (const key of Object.keys(latestFeeds) as SubredditKey[]) {
    const latestFeed = latestFeeds[key];
    const previousFeed = previousFeeds[key];

    for (const post of latestFeed.posts) {
      if (previousFeed.totalHash.includes(post.hash)) {
        continue;
      }

      (updatedFeeds[key] ??= {
        posts: [],
      }).posts.push(post);
    }
  }

  return {
    hasUpdatedFeeds: Object.keys(updatedFeeds).length > 0,
    feeds: updatedFeeds,
  };
}

async function reportNewPosts(
  feeds: UpdatedRedditFeeds,
  channelId: string,
  traceId: string,
): Promise<void> {
  for (const [key, feed] of Object.entries(feeds)) {
    const name = SUBREDDITS[key as SubredditKey].name;

    for (const post of feed.posts) {
      const payload = buildNewPostPayload(name, post);
      await sendMessage(channelId, payload);

      info(LOG_NAME, `New post made on ${name}: ${JSON.stringify(post)}.`, traceId);
    }
  }
}
