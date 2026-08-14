import crypto from "node:crypto";

import { config as globalConfig } from "#/config.js";
import config from "#data/twitter/filian/monitor-config.json" with { type: "json" };
import { HttpError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";

import { buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "twitter/filian";
const MONITOR_STATE_PATH = "./data/twitter/filian/monitor-state.json";
const LATEST_POSTS_INFO_PATH = "./data/twitter/filian/latest-posts-info.json";

type MonitorState = {
  "is-initialized": boolean;
};

export type MonitorContext = {
  "timeout-ms": number;
};

type LatestPost = {
  content: string;
  hash: string;
};

type LatestPosts = {
  posts: LatestPost[];
  hash: string;
};

type TwitterCredentials = {
  auth: string;
  cookie: string;
  "x-csrf-token": string;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const oldLatestPosts = readJsonFile<LatestPosts>(LATEST_POSTS_INFO_PATH);
  const newLatestPosts = await fetchLatestPosts(globalConfig.twitterAuth, context["timeout-ms"]);

  if (!state["is-initialized"]) {
    await initializeMonitor(state, newLatestPosts);
    return context;
  }

  if (compareLatestPostsHashes(oldLatestPosts.hash, newLatestPosts.hash)) {
    return context;
  }

  await handleUpdate(newLatestPosts, config["channel-id"], time, traceId);

  return context;
}

async function fetchLatestPosts(
  credentials: TwitterCredentials,
  timeoutMs: number,
): Promise<LatestPosts> {
  const response = await fetch(
    "https://x.com/i/api/graphql/hr4gzZONlq23okjU8fIe_A/UserTweets?variables=%7B%22userId%22%3A%221389652567941165058%22%2C%22count%22%3A20%2C%22includePromotedContent%22%3Afalse%2C%22withVoice%22%3Afalse%7D",
    {
      method: "GET",
      headers: {
        Authorization: credentials.auth,
        "Content-Type": "application/json",
        Cookie: credentials.cookie,
        "User-Agent": "",
        "X-Csrf-Token": credentials["x-csrf-token"],
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!response.ok) {
    throw new HttpError(
      "Failed to fetch latest posts.",
      response.status.toString(),
      response.statusText,
    );
  }

  const responseText = await response.text();
  const postTexts = [...responseText.matchAll(/"full_text"\s*:\s*"((?:\\.|[^"\\])*)"/g)].map(
    (match) => match[1]!,
  );

  if (Object.values(postTexts).length === 0) {
    return {
      posts: [],
      hash: "",
    };
  }

  const postContents: LatestPost[] = postTexts.map((text) => ({
    content: text,
    hash: crypto.createHash("sha256").update(text).digest("hex"),
  }));

  return {
    posts: postContents,
    hash: crypto.createHash("sha256").update(postTexts.join("")).digest("hex"),
  };
}

async function initializeMonitor(state: MonitorState, latestPosts: LatestPosts): Promise<void> {
  state["is-initialized"] = true;
  writeJsonFile(MONITOR_STATE_PATH, state);

  updateLatestPosts(latestPosts);
}

function compareLatestPostsHashes(oldHash: string, newHash: string): boolean {
  return oldHash === newHash;
}

async function handleUpdate(
  latestPosts: LatestPosts,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildUpdatePayload(time);
  await sendMessage(channelId, payload);

  updateLatestPosts(latestPosts);

  info(LOG_NAME, "New Tweet was observed.", traceId);
}

function updateLatestPosts(latestPosts: LatestPosts): void {
  writeJsonFile(LATEST_POSTS_INFO_PATH, latestPosts);
}
