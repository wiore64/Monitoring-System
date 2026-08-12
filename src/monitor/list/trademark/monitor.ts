import { HttpError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";

import { buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "trademark";
const MONITOR_CONFIG_PATH = "./data/trademark/monitor-config.json";
const MONITOR_STATE_PATH = "./data/trademark/monitor-state.json";
const TRADEMARKS_INFO_PATH = "./data/trademark/trademarks-info.json";

type MonitorConfig = {
  "channel-id": string;
};

type MonitorState = {
  "is-initialized": boolean;
};

export type MonitorContext = {
  "timeout-ms": number;
};

export type TrademarkInfo = {
  status: string;
  description: string;
  date: string;
};

type TrademarksInfo = {
  filian: TrademarkInfo;
  vsoccer: TrademarkInfo;
  "vtuber-awards": TrademarkInfo;
};

type TrademarkResponse = {
  metadata: {
    caseStatus: string;
    statusDate: string;
  };
  tm5Status: {
    tm5StatusDescriptor: string;
  };
};

type ComparisonResult = {
  hasChanges: boolean;
  updatedInfo: Partial<TrademarksInfo>;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const config = readJsonFile<MonitorConfig>(MONITOR_CONFIG_PATH);
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const oldTrademarksInfo = readJsonFile<TrademarksInfo>(TRADEMARKS_INFO_PATH);
  const newTrademarksInfo = await fetchTrademarksInfo(context["timeout-ms"]);

  if (!state["is-initialized"]) {
    await initializeMonitor(state, newTrademarksInfo, traceId);
    return context;
  }

  const result = compareTrademarksInfo(oldTrademarksInfo, newTrademarksInfo);

  if (!result.hasChanges) {
    return context;
  }

  await handleUpdate(newTrademarksInfo, result.updatedInfo, config["channel-id"], time, traceId);

  return context;
}

async function fetchTrademarksInfo(timeoutMs: number): Promise<TrademarksInfo> {
  const [filianTrademark, vsoccerTrademark, vtuberAwardsTrademark] = await Promise.all([
    fetchTrademarkInfo(
      "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99557803",
      timeoutMs,
    ),
    fetchTrademarkInfo(
      "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99557814",
      timeoutMs,
    ),
    fetchTrademarkInfo(
      "https://tmsearch.uspto.gov/tsdr-api-v1-0-0/tsdr-api?serialNumber=99750600",
      timeoutMs,
    ),
  ]);

  return {
    filian: filianTrademark,
    vsoccer: vsoccerTrademark,
    "vtuber-awards": vtuberAwardsTrademark,
  };
}

async function fetchTrademarkInfo(url: string, timeoutMs: number): Promise<TrademarkInfo> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

  if (!response.ok) {
    throw new HttpError(
      "Failed to fetch trademark info.",
      response.statusText,
      response.status.toString(),
    );
  }

  const data = (await response.json()) as TrademarkResponse;

  return {
    status: data.tm5Status.tm5StatusDescriptor,
    description: data.metadata.caseStatus,
    date: data.metadata.statusDate,
  };
}

async function initializeMonitor(
  state: MonitorState,
  trademarksInfo: TrademarksInfo,
  traceId: string,
): Promise<void> {
  state["is-initialized"] = true;
  writeJsonFile(MONITOR_STATE_PATH, state);

  updateTrademarksInfo(trademarksInfo);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareTrademarksInfo(oldInfo: TrademarksInfo, newInfo: TrademarksInfo): ComparisonResult {
  const updatedInfo: Partial<TrademarksInfo> = {};

  for (const trademarkName of Object.keys(oldInfo) as (keyof TrademarksInfo)[]) {
    const oldTrademark = oldInfo[trademarkName];
    const newTrademark = newInfo[trademarkName];

    if (oldTrademark.date === newTrademark.date) {
      continue;
    }

    updatedInfo[trademarkName] = newTrademark;
  }

  return {
    hasChanges: Object.keys(updatedInfo).length > 0,
    updatedInfo,
  };
}

async function handleUpdate(
  trademarksInfo: TrademarksInfo,
  changedTrademarks: Partial<TrademarksInfo>,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  for (const [trademarkName, trademarkInfo] of Object.entries(changedTrademarks)) {
    const payload = buildUpdatePayload(trademarkInfo, time);
    await sendMessage(channelId, payload);

    info(LOG_NAME, `Trademark ${trademarkName} updated.`, traceId);
  }

  updateTrademarksInfo(trademarksInfo);
}

function updateTrademarksInfo(trademarksInfo: TrademarksInfo): void {
  writeJsonFile(TRADEMARKS_INFO_PATH, trademarksInfo);
}
