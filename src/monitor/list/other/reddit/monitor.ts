import crypto from "node:crypto";

import { CONFIG as GLOBAL_CONFIG } from "#root/config.js";
import config from "#data/other/reddit/monitor-config.json" with { type: "json" };
import state from "#data/other/reddit/monitor-state.json" with { type: "json" };
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";
import { ValidationError } from "#shared/error.js";

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
    name: "THE_WALL_",
    url: "https://www.reddit.com/r/THE_WALL_/new/.json",
  },
} as const;

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
  link: string;
  timestamp: string;
  hash: string;
};

type RedditFeed = {
  posts: RedditPost[];
  totalHash: string;
};

type SubredditKey = keyof typeof SUBREDDITS;

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
      hasNewPosts: true;
      newPosts: UpdatedRedditFeeds;
    }
  | {
      hasNewPosts: false;
    };

export async function run(
  ctx: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const previousFeeds = readJsonFile<RedditFeeds>(REDDIT_FEEDS_PATH);
  const latestFeeds = await fetchRedditFeeds(GLOBAL_CONFIG.redditSessionId, ctx.timeoutMs);

  if (!state.isInitialized || !previousFeeds) {
    initializeMonitor(latestFeeds, traceId);
    return ctx;
  }

  const result = compareLatestPosts(previousFeeds, latestFeeds);

  if (!result.hasNewPosts) {
    return ctx;
  }

  await reportNewPosts(result.newPosts, config["channel-id"], traceId);
  writeJsonFile(REDDIT_FEEDS_PATH, latestFeeds);

  return ctx;
}

async function fetchRedditFeeds(credential: string, timeoutMs: number): Promise<RedditFeeds> {
  const [filian, wall] = await Promise.all([
    fetchRedditFeed(SUBREDDITS.filian.name, SUBREDDITS.filian.url, credential, timeoutMs),
    fetchRedditFeed(SUBREDDITS.wall.name, SUBREDDITS.wall.url, credential, timeoutMs),
  ]);

  return {
    filian,
    wall,
  };
}

async function fetchRedditFeed(
  name: string,
  url: string,
  credential: string,
  timeoutMs: number,
): Promise<RedditFeed> {
  const response = await fetchUrl(url, timeoutMs, {
    headers: {
      Cookie: credential,
    },
  });

  if (!response.success) {
    throw new ValidationError(`Failed to fetch Reddit feed for ${name}`, undefined, response.error);
  }

  const feedData = ((await response.data.json()) as RedditResponse).data;
  const posts: RedditPost[] = [];

  for (const post of feedData.children) {
    const postData = post.data;
    const postCreationTimestamp = new Date(postData.created * 1000).toUTCString();

    posts.push({
      author: postData.author,
      title: postData.title,
      link: `https://reddit.com${postData.permalink}`,
      timestamp: postCreationTimestamp,
      hash: crypto.hash("sha256", `${postData.author}${postCreationTimestamp}`),
    });
  }

  return {
    posts,
    totalHash: computeTotalHash(posts),
  };
}

function computeTotalHash(posts: RedditPost[]): string {
  return posts.map((post) => post.hash).join("");
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

    for (const post of Object.values(latestFeed.posts)) {
      if (previousFeed.totalHash.includes(post.hash)) {
        continue;
      }

      (updatedFeeds[key] ??= {
        posts: [],
      }).posts.push(post);
    }
  }

  return {
    hasNewPosts: Object.keys(updatedFeeds).length > 0,
    newPosts: updatedFeeds,
  };
}

async function reportNewPosts(
  feeds: UpdatedRedditFeeds,
  channelId: string,
  traceId: string,
): Promise<void> {
  for (const [key, feed] of Object.entries(feeds)) {
    const subredditName = SUBREDDITS[key as SubredditKey].name;

    for (const post of Object.values(feed.posts)) {
      const payload = buildNewPostPayload(subredditName, post);
      await sendMessage(channelId, payload);

      info(LOG_NAME, `New post posted on ${subredditName}: ${post}.`, traceId);
    }
  }
}
