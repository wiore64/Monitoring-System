import { config as globalConfig } from "#/config.js";
import config from "#data/youtube/filian/monitor-config.json" with { type: "json" };
import { HttpError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "youtube/filian";
const MONITOR_STATE_PATH = "./data/youtube/filian/monitor-state.json";
const CHANNEL_INFO_PATH = "./data/youtube/filian/channel-info.json";

type MonitorState = {
  "message-id": string;
};

export type MonitorContext = {
  "timeout-ms": number;
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

type ChangedChannelInfo = Partial<{
  [K in keyof ChannelInfo]: {
    oldValue: ChannelInfo[K];
    newValue: ChannelInfo[K];
  };
}>;

type ComparisonResult = {
  hasChanges: boolean;
  changedFields: ChangedChannelInfo;
};

type YoutubeChannelResponse = {
  items: Array<{
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
  }>;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const oldChannelInfo = readJsonFile<ChannelInfo>(CHANNEL_INFO_PATH);
  const newChannelInfo = await fetchChannelInfo(globalConfig.ytToken, context["timeout-ms"]);

  if (state["message-id"].length === 0) {
    await initializeMonitor(state, newChannelInfo, config["channel-id"], time, traceId);
    return context;
  }

  const result = compareChannelInfo(oldChannelInfo, newChannelInfo);

  if (!result.hasChanges) {
    return context;
  }

  await handleUpdate(
    newChannelInfo,
    result.changedFields,
    config["channel-id"],
    state["message-id"],
    time,
    traceId,
  );

  return context;
}

async function fetchChannelInfo(token: string, timeoutMs: number): Promise<ChannelInfo> {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&part=statistics&part=brandingSettings&id=UCvjNdLLy5sinqD92Axk8w-g&key=${token}`,
    {
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!response.ok) {
    throw new HttpError(
      `Failed to fetch channel info.`,
      response.status.toString(),
      response.statusText,
    );
  }

  const responseJson = (await response.json()) as YoutubeChannelResponse;
  const channel = responseJson.items[0];

  if (channel === undefined) {
    throw new TypeError(`Channel not found.`);
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
  state: MonitorState,
  channelInfo: ChannelInfo,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(channelInfo, time);
  const message = await sendMessage(channelId, payload);

  state["message-id"] = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  updateChannelInfo(channelInfo);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareChannelInfo(oldInfo: ChannelInfo, newInfo: ChannelInfo): ComparisonResult {
  const changedFields: ChangedChannelInfo = {};

  for (const key of Object.keys(newInfo) as (keyof ChannelInfo)[]) {
    if (newInfo[key] === oldInfo[key]) {
      continue;
    }

    // Tried my best to suppress it because it is obvious what it complains about is impossible.
    (changedFields as Record<keyof ChannelInfo, ChangedChannelInfo>)[key] = {
      oldValue: oldInfo[key],
      newValue: newInfo[key],
    } as ChangedChannelInfo;
  }

  return {
    hasChanges: Object.keys(changedFields).length > 0,
    changedFields,
  };
}

async function handleUpdate(
  channelInfo: ChannelInfo,
  changedFields: ChangedChannelInfo,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(channelInfo, time);
  await editMessage(channelId, messageId, mainPayload);

  for (const [field, { oldValue, newValue }] of Object.entries(changedFields)) {
    if (["viewCount", "subCount"].includes(field)) {
      continue;
    }

    // Also, suppressing the type assertion here because it is obvious what it complains about is impossible.
    const updatePayload = buildUpdatePayload(field as keyof ChannelInfo, oldValue, newValue, time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, `${field} observed to be updated.`, traceId);
  }

  updateChannelInfo(channelInfo);
}

function updateChannelInfo(info: ChannelInfo): void {
  writeJsonFile(CHANNEL_INFO_PATH, info);
}
