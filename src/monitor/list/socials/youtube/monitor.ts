import { CONFIG as GLOBAL_CONFIG } from "#root/config.js";
import config from "#data/socials/youtube/monitor-config.json" with { type: "json" };
import state from "#data/socials/youtube/monitor-state.json" with { type: "json" };
import { ValidationError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "monitors/socials/youtube";
const MONITOR_STATE_PATH = "./data/socials/youtube/monitor-state.json";
const CHANNEL_INFO_PATH = "./data/socials/youtube/channel-info.json";
const YOUTUBE_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=snippet&part=statistics&part=brandingSettings&id=UCvjNdLLy5sinqD92Axk8w-g&key={token}";

export type MonitorContext = {
  timeoutMs: number;
};

export type ChannelInfo = {
  name: string;
  handle: string;
  description: string;
  avatar: string;
  banner: string | null;
  videoCount: number;
  subCount: number;
  viewCount: number;
};

type UpdatedChannelInfo = {
  [K in keyof ChannelInfo]?: {
    new: ChannelInfo[K];
    old: ChannelInfo[K];
  };
};

type YoutubeResponseData = {
  items: {
    snippet: {
      title: string;
      customUrl: string;
      description: string;
      thumbnails: {
        high: {
          url: string;
        };
      };
    };
    brandingSettings: {
      image?: {
        bannerExternalUrl?: string;
      };
    };
    statistics: {
      viewCount: number;
      subscriberCount: number;
      videoCount: number;
    };
  }[];
};

type ComparisonResult = {
  hasUpdates: boolean;
  info: UpdatedChannelInfo;
};

export async function run(
  ctx: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldInfo = readJsonFile<ChannelInfo>(CHANNEL_INFO_PATH);
  const newInfo = await fetchChannelInfo(GLOBAL_CONFIG.ytToken, ctx.timeoutMs);

  if (state.messageId.length === 0) {
    await initializeMonitor(newInfo, config["channel-id"], traceId);
    return ctx;
  }

  if (Object.keys(oldInfo).length === 0) {
    writeJsonFile(CHANNEL_INFO_PATH, newInfo);
    debug(LOG_NAME, "Old info not found. New one persisted.", traceId);
    return ctx;
  }

  const result = compareChannelInfo(oldInfo, newInfo);

  if (!result.hasUpdates) {
    return ctx;
  }

  await reportUpdate(newInfo, result.info, config["channel-id"], state.messageId, time, traceId);
  writeJsonFile(CHANNEL_INFO_PATH, newInfo);

  return ctx;
}

async function fetchChannelInfo(token: string, timeoutMs: number): Promise<ChannelInfo> {
  const response = await fetchUrl(YOUTUBE_URL.replace("{token}", token), timeoutMs);

  if (!response.success) {
    throw response.error;
  }

  const data = (await response.data.json()) as YoutubeResponseData;
  const channel = data.items[0];

  if (channel == null) {
    throw new ValidationError(`Invalid data for the socials' YouTube channel`);
  }

  return {
    name: channel.snippet.title,
    handle: channel.snippet.customUrl,
    description: channel.snippet.description,
    avatar: channel.snippet.thumbnails.high.url,
    banner: channel.brandingSettings.image?.bannerExternalUrl ?? null,
    viewCount: channel.statistics.viewCount,
    subCount: channel.statistics.subscriberCount,
    videoCount: channel.statistics.videoCount,
  };
}

async function initializeMonitor(
  channelInfo: ChannelInfo,
  channelId: string,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(channelInfo, "N/A");
  const message = await sendMessage(channelId, payload);

  writeJsonFile(CHANNEL_INFO_PATH, channelInfo);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  debug(LOG_NAME, "Initialized.", traceId);
}

function compareChannelInfo(oldInfo: ChannelInfo, newInfo: ChannelInfo): ComparisonResult {
  const updatedInfo: UpdatedChannelInfo = {};

  for (const key of Object.keys(newInfo) as (keyof ChannelInfo)[]) {
    if (newInfo[key] === oldInfo[key]) {
      continue;
    }

    (updatedInfo as any)[key] = {
      new: newInfo[key],
      old: oldInfo[key],
    };
  }

  return {
    hasUpdates: Object.keys(updatedInfo).length > 0,
    info: updatedInfo,
  };
}

async function reportUpdate(
  channelInfo: ChannelInfo,
  updatedInfo: UpdatedChannelInfo,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(channelInfo, time.toUTCString());
  await editMessage(channelId, messageId, mainPayload);

  for (const [key, values] of Object.entries(updatedInfo)) {
    if (key === "viewCount" || key === "subCount") {
      continue;
    }

    const updatePayload = buildUpdatePayload(
      key as keyof ChannelInfo,
      values.new,
      values.old,
      time,
    );
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, `${key} observed to be updated from ${values.old} to ${values.new}.`, traceId);
  }
}
