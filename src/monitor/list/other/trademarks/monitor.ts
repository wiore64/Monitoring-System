import config from "#data/other/trademarks/monitor-config.json" with { type: "json" };
import state from "#data/other/trademarks/monitor-state.json" with { type: "json" };
import { ValidationError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

import { buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "monitors/other/trademarks";
const MONITOR_STATE_PATH = "./data/other/trademarks/monitor-state.json";
const TRADEMARKS_INFO_PATH = "./data/other/trademarks/trademarks-info.json";

const TRADEMARKS = {
  filian: {
    name: "Filian",
    link: "https://www.trademarkia.com/api/mark-status?serialNumber=99557803&variant=renewal",
  },
  vsoccer: {
    name: "VSoccer",
    link: "https://www.trademarkia.com/api/mark-status?serialNumber=99557814&variant=renewal",
  },
  vtuberAwards: {
    name: "The Vtuber Awards",
    link: "https://www.trademarkia.com/api/mark-status?serialNumber=99750600&variant=renewal",
  },
};

export type MonitorContext = {
  timeoutMs: number;
};

type TrademarkResponseData = {
  body: {
    data: {
      trademark_prosecution_history: {
        description_text: string;
        date: number;
      }[];
    };
  };
};

export type TrademarkInfo = {
  status: string;
  date: string;
};

type TrademarksInfo = {
  [T in keyof typeof TRADEMARKS]: TrademarkInfo;
};

type UpdatedTrademarksInfo = {
  [T in keyof TrademarksInfo]?: {
    new: TrademarkInfo;
    old: TrademarkInfo;
  };
};

type ComparisonResult = {
  hasUpdates: boolean;
  updatedInfo: UpdatedTrademarksInfo;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldTrademarksInfo = readJsonFile<TrademarksInfo>(TRADEMARKS_INFO_PATH);
  const newTrademarksInfo = await fetchTrademarksInfo(context.timeoutMs);

  if (!state.isInitialized || !oldTrademarksInfo) {
    initializeMonitor(newTrademarksInfo, traceId);
    return context;
  }

  const result = compareTrademarksInfo(newTrademarksInfo, oldTrademarksInfo);

  if (!result.hasUpdates) {
    return context;
  }

  await reportChanges(result.updatedInfo, config["channel-id"], traceId);
  writeJsonFile(TRADEMARKS_INFO_PATH, newTrademarksInfo);

  return context;
}

async function fetchTrademarksInfo(timeoutMs: number): Promise<TrademarksInfo> {
  const [filian, vsoccer, vtuberAwards] = await Promise.all([
    fetchTrademarkInfo(TRADEMARKS.filian.name, TRADEMARKS.filian.link, timeoutMs),
    fetchTrademarkInfo(TRADEMARKS.vsoccer.name, TRADEMARKS.vsoccer.link, timeoutMs),
    fetchTrademarkInfo(TRADEMARKS.vtuberAwards.name, TRADEMARKS.vtuberAwards.link, timeoutMs),
  ]);

  return { filian, vsoccer, vtuberAwards };
}

async function fetchTrademarkInfo(
  name: string,
  url: string,
  timeoutMs: number,
): Promise<TrademarkInfo> {
  const response = await fetchUrl(url, timeoutMs);

  if (!response.success) {
    throw response.error;
  }

  const latestEntry = ((await response.data.json()) as TrademarkResponseData).body.data
    .trademark_prosecution_history[0];

  if (!latestEntry || !latestEntry.description_text || !latestEntry.date) {
    throw new ValidationError(`Invalid latest entry for ${name}: ${JSON.stringify(latestEntry)}`);
  }

  const entryTimestamp = new Date(latestEntry.date * 1000);

  return {
    status: latestEntry.description_text,
    date: `${entryTimestamp.getUTCFullYear()}-${entryTimestamp.getUTCMonth()}-${entryTimestamp.getUTCDate()}`,
  };
}

function initializeMonitor(trademarksInfo: TrademarksInfo, traceId: string): void {
  writeJsonFile(TRADEMARKS_INFO_PATH, trademarksInfo);

  state.isInitialized = true;
  writeJsonFile(MONITOR_STATE_PATH, state);

  debug(LOG_NAME, "Initialized.", traceId);
}

function compareTrademarksInfo(newInfo: TrademarksInfo, oldInfo: TrademarksInfo): ComparisonResult {
  const updatedInfo: UpdatedTrademarksInfo = {};

  for (const trademarkName of Object.keys(newInfo) as (keyof TrademarksInfo)[]) {
    const newTrademark = newInfo[trademarkName];
    const oldTrademark = oldInfo[trademarkName];

    if (newTrademark.date === oldTrademark?.date) {
      continue;
    }

    updatedInfo[trademarkName] = {
      new: newTrademark,
      old: oldTrademark,
    };
  }

  return {
    hasUpdates: Object.keys(updatedInfo).length > 0,
    updatedInfo,
  };
}

async function reportChanges(
  updatedInfo: UpdatedTrademarksInfo,
  channelId: string,
  traceId: string,
): Promise<void> {
  for (const [trademarkName, trademarkInfo] of Object.entries(updatedInfo)) {
    const payload = buildUpdatePayload(
      TRADEMARKS[trademarkName as keyof TrademarksInfo].name,
      trademarkInfo.new,
    );
    await sendMessage(channelId, payload);

    info(
      LOG_NAME,
      `Trademark ${trademarkName} changed from ${JSON.stringify(trademarkInfo.old)} to ${JSON.stringify(trademarkInfo.new)}`,
      traceId,
    );
  }
}
