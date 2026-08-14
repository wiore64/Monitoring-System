import config from "#data/filianislost/stats/monitor-config.json" with { type: "json" };
import { HttpError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "filianislost/stats";
const MONITOR_STATE_PATH = "./data/filianislost/stats/monitor-state.json";
const STATS_INFO_PATH = "./data/filianislost/stats/monitor-stats.json";

type MonitorState = {
  "message-id": string;
};

export type MonitorContext = {
  "timeout-ms": number;
};

export type SignalStats = {
  userCount: number;
  signalCount: number;
  approvedSignalCount: number;
};

type ComparisonResult = {
  hasChanges: boolean;
  changedStats: Partial<SignalStats>;
};

type WebsiteResponse = {
  users: number;
  signals: number;
  approved: number;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const oldStats = readJsonFile<SignalStats>(STATS_INFO_PATH);
  const newStats = await fetchSignalStats(context["timeout-ms"]);

  if (state["message-id"].length === 0) {
    await initializeMonitor(state, newStats, config["channel-id"], time, traceId);
    return context;
  }

  const result = compareStats(oldStats, newStats);

  if (!result.hasChanges) {
    return context;
  }

  await handleUpdate(
    newStats,
    result.changedStats,
    config["channel-id"],
    state["message-id"],
    time,
    traceId,
  );

  return context;
}

async function fetchSignalStats(timeoutMs: number): Promise<SignalStats> {
  const response = await fetch("https://signal.filianislost.com/stats", {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new HttpError(
      "Failed to fetch signal stats.",
      response.status.toString(),
      response.statusText,
    );
  }

  const responseJson = (await response.json()) as WebsiteResponse;

  return {
    userCount: responseJson.users,
    signalCount: responseJson.signals,
    approvedSignalCount: responseJson.approved,
  };
}

async function initializeMonitor(
  state: MonitorState,
  stats: SignalStats,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(stats, time);
  const message = await sendMessage(channelId, payload);

  state["message-id"] = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  updateSignalStats(stats);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareStats(oldStats: SignalStats, newStats: SignalStats): ComparisonResult {
  const changedStats: Partial<SignalStats> = {};

  for (const key of Object.keys(newStats) as (keyof SignalStats)[]) {
    if (newStats[key] === oldStats[key]) {
      continue;
    }

    changedStats[key] = newStats[key];
  }

  return {
    hasChanges: Object.keys(changedStats).length > 0,
    changedStats,
  };
}

async function handleUpdate(
  stats: SignalStats,
  changedStats: Partial<SignalStats>,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(stats, time);
  await editMessage(channelId, messageId, mainPayload);

  for (const key of Object.keys(changedStats) as (keyof SignalStats)[]) {
    if (["userCount", "signalCount"].includes(key)) {
      continue;
    }

    const updatePayload = buildUpdatePayload(time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, `New signal observed.`, traceId);
  }

  updateSignalStats(stats);
}

function updateSignalStats(stats: SignalStats): void {
  writeJsonFile(STATS_INFO_PATH, stats);
}
