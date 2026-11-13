import { DnsError, getCode, ValidationError } from "#shared/error.js";
import { generateTraceId, info, severe, warn } from "#utils/logger.js";

import {
  type MonitorContext as BlackfileIndexContext,
  run as runBlackfileIndex,
} from "./list/blackfile-index/monitor.js";
import {
  type MonitorContext as FilianislostContext,
  run as runFilianislost,
} from "./list/filianislost/monitor.js";
import {
  type MonitorContext as MinecraftInfoContext,
  run as runMinecraftInfo,
} from "./list/minecraft/info/monitor.js";
import {
  type MonitorContext as MinecraftStateContext,
  run as runMinecraftState,
} from "./list/minecraft/state/monitor.js";
import {
  type MonitorContext as TrademarkContext,
  run as runTrademarks,
} from "./list/other/trademarks/monitor.js";
import {
  type MonitorContext as YoutubeFilianContext,
  run as runYoutubeFilian,
} from "./list/socials/youtube/monitor.js";

const LOG_NAME = "Monitor Service";

export enum MonitorType {
  BlackfileIndex = "blackfile-index",
  Filianislost = "filianislost",
  MinecraftInfo = "minecraft-info",
  MinecraftState = "minecraft-state",
  Trademark = "trademarks",
  YoutubeFilian = "youtube-filian",
}

type MonitorContext = {
  [MonitorType.BlackfileIndex]: BlackfileIndexContext;
  [MonitorType.Filianislost]: FilianislostContext;
  [MonitorType.MinecraftInfo]: MinecraftInfoContext;
  [MonitorType.MinecraftState]: MinecraftStateContext;
  [MonitorType.Trademark]: TrademarkContext;
  [MonitorType.YoutubeFilian]: YoutubeFilianContext;
};

type MonitorExecutor<T extends MonitorType> = (
  context: MonitorContext[T],
  time: Date,
  traceId: string,
) => Promise<MonitorContext[T]>;

export type ServiceResult = { success: true } | { success: false; reason: string };

const MONITOR_REGISTRY: { [T in MonitorType]: MonitorExecutor<T> } = {
  [MonitorType.BlackfileIndex]: runBlackfileIndex,
  [MonitorType.Filianislost]: runFilianislost,
  [MonitorType.MinecraftInfo]: runMinecraftInfo,
  [MonitorType.MinecraftState]: runMinecraftState,
  [MonitorType.Trademark]: runTrademarks,
  [MonitorType.YoutubeFilian]: runYoutubeFilian,
};

const runningMonitors = new Set<MonitorType>();
const monitorIntervals = new Map<MonitorType, NodeJS.Timeout>();
const monitorContexts = new Map<MonitorType, object>();

export function startMonitorInterval<T extends MonitorType>(
  monitorType: T,
  initialContext: MonitorContext[T],
  intervalMs: number,
): ServiceResult {
  if (monitorIntervals.has(monitorType)) {
    return {
      success: false,
      reason: `Monitor ${monitorType} already has active interval`,
    };
  }

  const interval = setInterval(() => void runMonitor(monitorType, initialContext), intervalMs);
  monitorIntervals.set(monitorType, interval);

  return { success: true };
}

export async function runMonitor<T extends MonitorType>(
  monitor: T,
  initialContext: MonitorContext[T],
  time: Date = new Date(),
  traceId: string = generateTraceId(),
): Promise<ServiceResult> {
  if (runningMonitors.has(monitor)) {
    return { success: false, reason: `Monitor ${monitor} already running` };
  }

  const executor = MONITOR_REGISTRY[monitor];

  if (!executor) {
    throw new TypeError(`Monitor ${monitor} not registered`);
  }

  runningMonitors.add(monitor);

  try {
    const context = structuredClone(monitorContexts.get(monitor) ?? initialContext);
    const newContext = await executor(context as MonitorContext[T], time, traceId);

    monitorContexts.set(monitor, newContext);
    processSuccess(monitor, traceId);

    return { success: true };
  } catch (cause: unknown) {
    if (!(cause instanceof Error)) {
      throw new ValidationError(`Non-error thrown: ${JSON.stringify(cause)}`);
    }

    processError(monitor, cause, traceId);

    return {
      success: false,
      reason: cause.message,
    };
  } finally {
    runningMonitors.delete(monitor);
  }
}

// ========================
// OUTAGE MANAGEMENT SYSTEM
// ========================

const outageErrorThreshold = 3;
let outageErrorCount = 0;
let isOutageActive = false;

function processSuccess(monitor: MonitorType, traceId: string) {
  if (outageErrorCount > 0) {
    outageErrorCount--;
  }

  if (isOutageActive && outageErrorCount == 0) {
    isOutageActive = false;

    info(
      LOG_NAME,
      `Network outage resolved, according to ${monitor}. Future DNS errors are now resumed.`,
      traceId,
    );
  }
}

function processError(monitor: MonitorType, error: Error, traceId: string) {
  if (!(error instanceof DnsError)) {
    warn(
      LOG_NAME,
      `Failed to run ${monitor} (${error.name}) (${getCode(error)}): ${error.message}.\n\n${error.stack ?? "No stack trace provided."}`,
      traceId,
    );
    return;
  }

  if (isOutageActive) {
    return;
  }

  outageErrorCount++;

  warn(
    LOG_NAME,
    `${outageErrorCount}/${outageErrorThreshold} Failed to run ${monitor} (${error.name}) (${getCode(error)}): ${error.message}.\n\n${error.stack ?? "No stack trace provided."}`,
    traceId,
  );

  if (outageErrorCount < outageErrorThreshold) {
    return;
  }

  isOutageActive = true;

  severe(
    LOG_NAME,
    `Network outage detected, according to ${monitor}. Future DNS errors will be suppressed.`,
    traceId,
  );
}
