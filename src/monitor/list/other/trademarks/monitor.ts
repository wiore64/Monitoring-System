import config from "#data/other/trademarks/monitor-config.json" with { type: "json" };
import state from "#data/other/trademarks/monitor-state.json" with { type: "json" };
import { HttpError, translateNetworkError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
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
    caseStatus: string;
    statusDate: string;
    tm5Status: {
      tm5StatusDescriptor: string;
    };
  };
};

export type TrademarkInfo = {
  status: string;
  description: string;
  date: string;
};

export type TrademarksInfo = {
  filian: TrademarkInfo;
  vsoccer: TrademarkInfo;
  vtuberAwards: TrademarkInfo;
};

type ComparisonResult = {
  hasChanges: boolean;
  changedInfo: Partial<TrademarksInfo>;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldTrademarksInfo = readJsonFile<TrademarksInfo>(TRADEMARKS_INFO_PATH);
  const newTrademarksInfo = await fetchTrademarksInfo(context.timeoutMs);

  if (!state.isInitialized) {
    await initializeMonitor(newTrademarksInfo, traceId);
    return context;
  }

  const result = compareTrademarksInfo(newTrademarksInfo, oldTrademarksInfo);

  if (!result.hasChanges) {
    return context;
  }

  await handleChanges(newTrademarksInfo, result.changedInfo, config["channel-id"], time, traceId);

  return context;
}

async function fetchTrademarksInfo(timeoutMs: number): Promise<TrademarksInfo> {
  const [filianTrademark, vsoccerTrademark, vtuberAwardsTrademark] = await Promise.all([
    fetchTrademarkInfo(TRADEMARK_FILIAN_URL, timeoutMs),
    fetchTrademarkInfo(TRADEMARK_VSOCCER_URL, timeoutMs),
    fetchTrademarkInfo(TRADEMARK_VTUBER_AWARDS_URL, timeoutMs),
  ]);

  return {
    filian: filianTrademark,
    vsoccer: vsoccerTrademark,
    vtuberAwards: vtuberAwardsTrademark,
  };
}

async function fetchTrademarkInfo(url: string, timeoutMs: number): Promise<TrademarkInfo> {
  let response;

  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (thing: unknown) {
    if (!(thing instanceof Error)) {
      throw new TypeError(`Non-error thrown: ${thing}`, { cause: thing });
    }

    throw translateNetworkError(thing);
  }

  if (!response.ok) {
    throw new HttpError(
      "Failed to fetch trademark info.",
      response.statusText,
      `${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as TrademarkResponseData;

  return {
    status: data.metadata.tm5Status.tm5StatusDescriptor,
    description: data.metadata.caseStatus,
    date: data.metadata.statusDate,
  };
}

async function initializeMonitor(trademarksInfo: TrademarksInfo, traceId: string): Promise<void> {
  state.isInitialized = true;
  writeJsonFile(MONITOR_STATE_PATH, state);

  writeJsonFile(TRADEMARKS_INFO_PATH, trademarksInfo);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareTrademarksInfo(newInfo: TrademarksInfo, oldInfo: TrademarksInfo): ComparisonResult {
  const changedInfo: Partial<TrademarksInfo> = {};

  for (const trademarkName of Object.keys(newInfo) as (keyof TrademarksInfo)[]) {
    const newTrademark = newInfo[trademarkName];
    const oldTrademark = oldInfo[trademarkName];

    if (newTrademark.date === oldTrademark.date) {
      continue;
    }

    changedInfo[trademarkName] = newTrademark;
  }

  return {
    hasChanges: Object.keys(changedInfo).length > 0,
    changedInfo,
  };
}

async function handleChanges(
  newTrademarksInfo: TrademarksInfo,
  updatedTrademarksInfos: Partial<TrademarksInfo>,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  for (const [trademarkName, trademarkInfo] of Object.entries(updatedTrademarksInfos)) {
    const payload = buildUpdatePayload(trademarkName as keyof TrademarksInfo, trademarkInfo, time);
    await sendMessage(channelId, payload);

    info(LOG_NAME, `Trademark ${trademarkName} changed.`, traceId);
  }

  writeJsonFile(TRADEMARKS_INFO_PATH, newTrademarksInfo);
}
