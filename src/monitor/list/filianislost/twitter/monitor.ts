import crypto from "node:crypto";

import { CONFIG as GLOBAL_CONFIG } from "#root/config.js";
import config from "#data/filianislost/twitter/monitor-config.json" with { type: "json" };
import state from "#data/filianislost/twitter/monitor-state.json" with { type: "json" };
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

import { buildMainPayload, buildUpdatePayload, buildNewPostPayload } from "./payload-builder.js";

const LOG_NAME = "monitors/filianislost/twitter";
const TWITTER_URL =
  "https://x.com/i/api/graphql/hr4gzZONlq23okjU8fIe_A/UserTweets?variables=%7B%22userId%22%3A%222061261454637228032%22%2C%22count%22%3A20%2C%22includePromotedContent%22%3Afalse%2C%22withVoice%22%3Afalse%7D";
const MONITOR_STATE_PATH = "./data/filianislost/twitter/monitor-state.json";
const TWITTER_FEED_PATH = "./data/filianislost/twitter/latest-posts-info.json";

export type MonitorContext = {
  timeoutMs: number;
};

type TwitterPost = {
  content: string;
  link: string;
  timestamp: string;
  hash: string;
};

type TwitterFeed = {
  posts: TwitterPost[];
  totalHash: string;
};

export type TwitterAccount = {
  name: string;
  username: string;
  description: string;
  avatarLink: string;
  feed: TwitterFeed;
};

type ComparisonResult =
  | {
      hasUpdates: true;
      updates: {
        new: Partial<TwitterAccount>;
        old: Partial<TwitterAccount>;
      };
    }
  | {
      hasNewPosts: false;
    };

export async function run(
  ctx: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const previousState = readJsonFile<TwitterAccount>(TWITTER_FEED_PATH);
  const latestState = await fetchLatestPosts(GLOBAL_CONFIG.twitterAuth, ctx.timeoutMs);

  if (state.messageId.length === 0 || !previousState) {
    await initializeMonitor(latestState, config["channel-id"], traceId);
    return ctx;
  }

  return ctx;
}

async function fetchLatestPosts(credentials: object, timeoutMs: number): Promise<TwitterAccount> {
  const response = await fetchUrl(TWITTER_URL, timeoutMs, {
    method: "GET",
    headers: {
      ...credentials,
      "Content-Type": "application/json",
      "User-Agent": "",
    },
  });

  if (!response.success) {
    throw response.error;
  }

  // ...

  return {
    name: "",
    username: "",
    description: "",
    avatarLink: "",
    feed: {
      posts: [],
      totalHash: "",
    },
  };
}

async function initializeMonitor(
  latestState: TwitterAccount,
  channelId: string,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(latestState, "N/A");
  const message = await sendMessage(channelId, payload);

  writeJsonFile(TWITTER_FEED_PATH, latestState);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  debug(LOG_NAME, "Initialized.", traceId);
}
