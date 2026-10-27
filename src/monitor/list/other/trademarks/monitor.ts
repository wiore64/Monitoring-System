import config from "#data/other/trademarks/monitor-config.json" with { type: "json" };
import state from "#data/other/trademarks/monitor-state.json" with { type: "json" };
import { ValidationError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

import { buildTrademarkUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "monitors/other/trademarks";
const MONITOR_STATE_PATH = "./data/other/trademarks/monitor-state.json";
const TRADEMARKS_INFO_PATH = "./data/other/trademarks/trademarks-info.json";

const TRADEMARKS = {
  filian: {
    name: "FILIAN",
    link: "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99557803",
  },
  vsoccer: {
    name: "VSOCCER",
    link: "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99557814",
  },
  vtuberAwards: {
    name: "THE VTUBER AWARDS",
    link: "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99750600",
  },
};

export type MonitorContext = {
  timeoutMs: number;
};

type TrademarkResponseData = {
  prosecutionHistory: {
    historyDate: string;
    proceedingNumber: number | string;
    historyDescription: string;
  }[];
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

  if (!state.isInitialized) {
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

  const data = (await response.data.json()) as TrademarkResponseData;

  if (!data.prosecutionHistory) {
    throw new ValidationError(`Invalid data for ${name}: ${JSON.stringify(data)}`);
  }

  // Sorted from Newest to Oldest
  for (const entry of data.prosecutionHistory) {
    if (!entry.historyDate || !entry.historyDescription || entry.proceedingNumber == null) {
      throw new ValidationError(`Incomplete entry for ${name}: ${JSON.stringify(entry)}`);
    }

    if (typeof entry.proceedingNumber === "string") {
      continue;
    }

    return {
      status: entry.historyDescription,
      date: entry.historyDate,
    };
  }

  throw new ValidationError(`No complete entries for ${name}: ${JSON.stringify(data)}`);
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
    const payload = buildTrademarkUpdatePayload(
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
