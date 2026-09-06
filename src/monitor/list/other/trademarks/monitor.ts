import config from "#data/other/trademarks/monitor-config.json" with { type: "json" };
import state from "#data/other/trademarks/monitor-state.json" with { type: "json" };
import { HttpError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";

import { buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "other/trademarks";
const MONITOR_STATE_PATH = "./data/other/trademarks/monitor-state.json";
const TRADEMARKS_INFO_PATH = "./data/other/trademarks/trademarks-info.json";

const TRADEMARK_FILIAN_URL =
  "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99557803";
const TRADEMARK_VSOCCER_URL =
  "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99557814";
const TRADEMARK_VTUBER_AWARDS_URL =
  "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99750600";

export type MonitorContext = {
  timeoutMs: number;
};

type TrademarkResponseData = {
  metadata: {
    tm5Status: {
      tm5StatusDescriptor: string;
    };
  };
  prosecutionHistory: {
    historyDate: string;
    historyDescription: string;
  }[];
};

export type TrademarkType = "Filian" | "Vsoccer" | "Vtuber Awards";

export type TrademarkInfo = {
  status: string;
  description: string;
  date: string;
};

type TrademarksInfo = Record<TrademarkType, TrademarkInfo>;

type ChangedTrademarksInfo = {
  [T in TrademarkType]?: {
    old: TrademarkInfo;
    new: TrademarkInfo;
  };
};

type ComparisonResult = {
  hasChanges: boolean;
  changedTrademarksInfo: ChangedTrademarksInfo;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldTrademarksInfo = readJsonFile<TrademarksInfo>(TRADEMARKS_INFO_PATH);
  const newTrademarksInfo = await fetchTrademarksInfo(context.timeoutMs);

  if (!state.isInitialized || !oldTrademarksInfo) {
    await initializeMonitor(newTrademarksInfo, traceId);
    return context;
  }

  const result = compareTrademarksInfo(newTrademarksInfo, oldTrademarksInfo);

  if (!result.hasChanges) {
    return context;
  }

  debug(
    LOG_NAME,
    `Trademarks info changed: ${JSON.stringify(result.changedTrademarksInfo)}`,
    traceId,
  );

  await reportChanges(result.changedTrademarksInfo, config["channel-id"], time, traceId);
  writeJsonFile(TRADEMARKS_INFO_PATH, newTrademarksInfo);

  return context;
}

async function fetchTrademarksInfo(timeoutMs: number): Promise<TrademarksInfo> {
  const [filianTrademark, vsoccerTrademark, vtuberAwardsTrademark] = await Promise.all([
    fetchTrademarkInfo(TRADEMARK_FILIAN_URL, timeoutMs),
    fetchTrademarkInfo(TRADEMARK_VSOCCER_URL, timeoutMs),
    fetchTrademarkInfo(TRADEMARK_VTUBER_AWARDS_URL, timeoutMs),
  ]);

  return {
    Filian: filianTrademark,
    Vsoccer: vsoccerTrademark,
    "Vtuber Awards": vtuberAwardsTrademark,
  };
}

async function fetchTrademarkInfo(url: string, timeoutMs: number): Promise<TrademarkInfo> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

  if (!response.ok) {
    throw new HttpError(
      "Failed to fetch trademark info.",
      `${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as TrademarkResponseData;

  if (!data.metadata || !data.prosecutionHistory || !data.prosecutionHistory[0]) {
    throw new TypeError("Invalid response data");
  }

  return {
    status: data.metadata.tm5Status.tm5StatusDescriptor,
    description: data.prosecutionHistory[0].historyDescription,
    date: data.prosecutionHistory[0].historyDate,
  };
}

async function initializeMonitor(trademarksInfo: TrademarksInfo, traceId: string): Promise<void> {
  writeJsonFile(TRADEMARKS_INFO_PATH, trademarksInfo);

  state.isInitialized = true;
  writeJsonFile(MONITOR_STATE_PATH, state);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareTrademarksInfo(newInfo: TrademarksInfo, oldInfo: TrademarksInfo): ComparisonResult {
  const changedTrademarksInfo: ChangedTrademarksInfo = {};

  for (const trademarkName of Object.keys(newInfo) as (keyof TrademarksInfo)[]) {
    const newTrademark = newInfo[trademarkName];
    const oldTrademark = oldInfo[trademarkName];

    if (newTrademark.date === oldTrademark.date) {
      continue;
    }

    changedTrademarksInfo[trademarkName] = {
      old: oldTrademark,
      new: newTrademark,
    };
  }

  return {
    hasChanges: Object.keys(changedTrademarksInfo).length > 0,
    changedTrademarksInfo,
  };
}

async function reportChanges(
  changedTrademarksInfos: ChangedTrademarksInfo,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  for (const [trademarkName, trademarkInfo] of Object.entries(changedTrademarksInfos)) {
    const payload = buildUpdatePayload(
      trademarkName as keyof TrademarksInfo,
      trademarkInfo.new,
      time,
    );
    await sendMessage(channelId, payload);

    info(
      LOG_NAME,
      `Trademark ${trademarkName} changed from ${JSON.stringify(trademarkInfo.old)} to ${JSON.stringify(trademarkInfo.new)}.`,
      traceId,
    );
  }
}
