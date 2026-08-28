import config from "#data/filianislost/website/stats/monitor-config.json" with { type: "json" };
import state from "#data/filianislost/website/stats/monitor-state.json" with { type: "json" };
import { HttpError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";

import { buildMainPayload, buildSignalPayload, buildUpdatePayload } from "./payload-builder.js";
import { updateAvailabilityFlag } from "../availability.js";

const LOG_NAME = "filianislost/stats";
const MONITOR_STATE_PATH = "./data/filianislost/website/stats/monitor-state.json";
const STATS_INFO_PATH = "./data/filianislost/website/stats/website-stats.json";

export type MonitorContext = {
  timeoutMs: number;
};

type WebsiteResponse = {
  users: number;
  signals: number;
  approved: number;
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

export type SignalInfo = {
  num_id: number;
  name: string;
  location: string;
  tag: string;
  image_file: string;
  submitted_at: string;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldStats = readJsonFile<SignalStats>(STATS_INFO_PATH);
  const newStats = await fetchSignalStats(context.timeoutMs, time, traceId);

  if (state.messageId.length === 0) {
    await initializeMonitor(newStats, config["channel-id"], time, traceId);
    return context;
  }

  const result = compareStats(newStats, oldStats);

  if (!result.hasChanges) {
    return context;
  }

  await handleUpdate(
    newStats,
    oldStats,
    config["channel-id"],
    state.messageId,
    context.timeoutMs,
    time,
    traceId,
  );

  return context;
}

async function fetchSignalStats(
  timeoutMs: number,
  time: Date,
  traceId: string,
): Promise<SignalStats> {
  const response = await fetch("https://signal.filianislost.com/stats", {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    await updateAvailabilityFlag(false, time, traceId);
    throw new HttpError(
      "Failed to fetch signal stats.",
      response.statusText,
      `${response.status} ${response.statusText}`,
    );
  }

  await updateAvailabilityFlag(true, time, traceId);

  const responseJson = (await response.json()) as WebsiteResponse;

  return {
    userCount: responseJson.users,
    signalCount: responseJson.signals,
    approvedSignalCount: responseJson.approved,
  };
}

async function initializeMonitor(
  stats: SignalStats,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(stats, time);
  const message = await sendMessage(channelId, payload);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  writeJsonFile(STATS_INFO_PATH, stats);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareStats(newStats: SignalStats, oldStats: SignalStats): ComparisonResult {
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
  newStats: SignalStats,
  oldStats: SignalStats,
  channelId: string,
  messageId: string,
  timeoutMs: number,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(newStats, time);
  await editMessage(channelId, messageId, mainPayload);

  const count = newStats.approvedSignalCount - oldStats.approvedSignalCount;

  if (count !== 0) {
    const updatePayload = buildUpdatePayload(count, time);
    await sendMessage(channelId, updatePayload);

    const newSignalsInfo = await postNewSignals(count, timeoutMs);

    for (const newSignalInfo of newSignalsInfo) {
      const signalPayload = buildSignalPayload(newSignalInfo, time);
      await sendMessage(channelId, signalPayload);
    }

    info(LOG_NAME, `${count} signal(s) observed.`, traceId);
  }

  writeJsonFile(STATS_INFO_PATH, newStats);
}

async function postNewSignals(count: number, timeoutMs: number): Promise<SignalInfo[]> {
  const newSignalsInfoResponse = await fetch(
    `https://signal.filianislost.com/fetch?limit=${count}&desc=1`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );

  if (!newSignalsInfoResponse.ok) {
    throw new HttpError(
      "Failed to fetch new signals information.",
      newSignalsInfoResponse.statusText,
      `${newSignalsInfoResponse.status} ${newSignalsInfoResponse.statusText}`,
    );
  }

  const newSignalsInfo = (await newSignalsInfoResponse.json()) as SignalInfo[];

  return newSignalsInfo.map((newSignalInfo) => {
    return {
      ...newSignalInfo,
      image_file: `https://signal.filianislost.com/static/uploads/${newSignalInfo.image_file}`,
    };
  });
}
