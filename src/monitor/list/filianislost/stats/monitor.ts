import { HttpError } from "#shared/error.js";
import { info } from "#shared/utils/logger";
import { editMessage, sendMessage } from "#shared/utils/message";
import { readJsonFile, writeJsonFile } from "#utils/file.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "filianislost/stats";
const MONITOR_CONFIG_PATH = "./data/filianislost/stats/monitor-config.json";
const MONITOR_STATE_PATH = "./data/filianislost/stats/monitor-state.json";
const MONITOR_STATS_PATH = "./data/filianislost/stats/monitor-stats.json";

type MonitorConfig = {
  "channel-id": string;
};

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

type ComparisonResult =
  { hasChanged: false } | { hasChanged: true; changedStats: Partial<SignalStats> };

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const config = readJsonFile<MonitorConfig>(MONITOR_CONFIG_PATH);
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const oldStats = readJsonFile<SignalStats>(MONITOR_STATS_PATH);
  const newStats = await fetchSignalStats();

  if (state["message-id"].length === 0) {
    await initializeMonitor(state, newStats, config["channel-id"], traceId);
    return context;
  }

  const result = compareStats(oldStats, newStats);

  if (!result.hasChanged) {
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

async function fetchSignalStats(): Promise<SignalStats> {
  const response = await fetch("https://signal.filianislost.com/stats");

  if (!response.ok) {
    throw new HttpError(
      "Failed to fetch signal stats",
      response.status.toString(),
      response.statusText,
    );
  }

  return (await response.json()) as SignalStats;
}

async function initializeMonitor(
  state: MonitorState,
  stats: SignalStats,
  channelId: string,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(stats, new Date());
  const message = await sendMessage(channelId, payload);

  state["message-id"] = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  updateSignalStats(stats);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareStats(oldStats: SignalStats, newStats: SignalStats): ComparisonResult {
  const changedStats: Partial<SignalStats> = {};

  if (oldStats.userCount !== newStats.userCount) {
    changedStats.userCount = newStats.userCount;
  }

  if (oldStats.signalCount !== newStats.signalCount) {
    changedStats.signalCount = newStats.signalCount;
  }

  if (oldStats.approvedSignalCount !== newStats.approvedSignalCount) {
    changedStats.approvedSignalCount = newStats.approvedSignalCount;
  }

  if (Object.keys(changedStats).length === 0) {
    return { hasChanged: false };
  }

  return { hasChanged: true, changedStats };
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
    if (key !== "approvedSignalCount") {
      continue;
    }

    const updatePayload = buildUpdatePayload(time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, `A new approved signal reported.`, traceId);
  }

  updateSignalStats(stats);
}

function updateSignalStats(stats: SignalStats): void {
  writeJsonFile(MONITOR_STATS_PATH, stats);
}
