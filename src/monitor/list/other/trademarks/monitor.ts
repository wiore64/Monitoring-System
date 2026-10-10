import config from "#data/other/trademarks/monitor-config.json" with { type: "json" };
import state from "#data/other/trademarks/monitor-state.json" with { type: "json" };
import { ValidationError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

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

export type TrademarkInfo = {
  status: string;
  description: string;
  date: string;
};

type TrademarksInfo = {
  Filian: TrademarkInfo;
  Vsoccer: TrademarkInfo;
  "Vtuber Awards": TrademarkInfo;
};

export type TrademarkType = keyof TrademarksInfo;

type ChangedTrademarksInfo = {
  [T in TrademarkType]?: {
    new: TrademarkInfo;
    old: TrademarkInfo;
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

  await reportChanges(result.changedTrademarksInfo, config["channel-id"], traceId);
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
  const response = await fetchUrl(url, timeoutMs);

  if (!response.success) {
    throw response.error;
  }

  const data = (await response.data.json()) as TrademarkResponseData;

  if (!data.metadata || !data.prosecutionHistory || !data.prosecutionHistory[0]) {
    throw new ValidationError(
      `Invalid trademark response data: ${JSON.stringify(data)}`,
      "ERR_INVALID_TRADEMARK_RESPONSE_DATA",
    );
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

  for (const trademarkName of Object.keys(newInfo) as TrademarkType[]) {
    const newTrademark = newInfo[trademarkName];
    const oldTrademark = oldInfo[trademarkName];

    if (newTrademark.date === oldTrademark.date) {
      continue;
    }

    changedTrademarksInfo[trademarkName] = {
      new: newTrademark,
      old: oldTrademark,
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
  traceId: string,
): Promise<void> {
  for (const [trademarkName, trademarkInfo] of Object.entries(changedTrademarksInfos)) {
    const payload = buildUpdatePayload(trademarkName as TrademarkType, trademarkInfo.new);
    await sendMessage(channelId, payload);

    info(
      LOG_NAME,
      `Trademark ${trademarkName} changed from ${JSON.stringify(trademarkInfo.old)} to ${JSON.stringify(trademarkInfo.new)}`,
      traceId,
    );
  }
}
