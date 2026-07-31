import { DnsError, getStack, toError } from "#shared/error.js";
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
  type MonitorContext as TwitterContext,
  run as runTwitter,
} from "./list/twitter/monitor.js";
import {
  type MonitorContext as YoutubeContext,
  run as runYoutube,
} from "./list/youtube/monitor.js";

const LOG_NAME = "Monitor Service";

export const MonitorType = {
  BlackfileIndex: "blackfile-index",
  Filianislost: "filianislost",
  MinecraftInfo: "minecraft-info",
  MinecraftState: "minecraft-state",
  Twitter: "twitter",
  Youtube: "youtube",
} as const;

export type MonitorType = (typeof MonitorType)[keyof typeof MonitorType];

type MonitorContext = {
  [MonitorType.BlackfileIndex]: BlackfileIndexContext;
  [MonitorType.Filianislost]: FilianislostContext;
  [MonitorType.MinecraftInfo]: MinecraftInfoContext;
  [MonitorType.MinecraftState]: MinecraftStateContext;
  [MonitorType.Twitter]: TwitterContext;
  [MonitorType.Youtube]: YoutubeContext;
};

type MonitorExecutor<T extends MonitorType> = (
  context: MonitorContext[T],
  time: Date,
  traceId: string,
) => Promise<MonitorContext[T]>;

type ServiceResult = { success: true } | { success: false; reason: string };

export const MONITOR_PATHS: Record<MonitorType, string> = {
  [MonitorType.BlackfileIndex]: "./list/blackfile-index/monitor.js",
  [MonitorType.Filianislost]: "./list/filianislost/monitor.js",
  [MonitorType.MinecraftInfo]: "./list/minecraft/info/monitor.js",
  [MonitorType.MinecraftState]: "./list/minecraft/state/monitor.js",
  [MonitorType.Twitter]: "./list/twitter/monitor.js",
  [MonitorType.Youtube]: "./list/youtube/monitor.js",
} as const;

const MONITOR_REGISTRY: { [T in MonitorType]: MonitorExecutor<T> } = {
  [MonitorType.BlackfileIndex]: runBlackfileIndex,
  [MonitorType.Filianislost]: runFilianislost,
  [MonitorType.MinecraftInfo]: runMinecraftInfo,
  [MonitorType.MinecraftState]: runMinecraftState,
  [MonitorType.Twitter]: runTwitter,
  [MonitorType.Youtube]: runYoutube,
} as const;

const monitorIntervals: Map<MonitorType, NodeJS.Timeout> = new Map();
const monitorContexts: Map<MonitorType, object> = new Map();

let isNetworkOutage = false;

export function startMonitorInterval<T extends MonitorType>(
  monitorType: T,
  intervalMs: number,
  initialContext: MonitorContext[T],
): ServiceResult {
  if (isMonitorInInterval(monitorType)) {
    return { success: false, reason: `Monitor ${monitorType} already in interval.` };
  }

  monitorIntervals.set(
    monitorType,
    setInterval(() => void runMonitor(monitorType, initialContext), intervalMs),
  );

  return { success: true };
}

export function stopMonitorInterval(monitorType: MonitorType) {
  if (!isMonitorInInterval(monitorType)) {
    return { success: false, reason: `Monitor ${monitorType} not in interval.` };
  }

  clearInterval(monitorIntervals.get(monitorType));

  monitorIntervals.delete(monitorType);
  monitorContexts.delete(monitorType);

  return { success: true };
}

export function isMonitorInInterval(monitorType: MonitorType): boolean {
  return monitorIntervals.has(monitorType);
}

export async function runMonitor<T extends MonitorType>(
  monitorType: T,
  initialContext: MonitorContext[T],
  time: Date = new Date(),
  traceId: string = generateTraceId(),
): Promise<ServiceResult> {
  const runnable = MONITOR_REGISTRY[monitorType];
  if (!runnable) {
    throw new TypeError(`Monitor ${monitorType} not registered.`);
  }

  try {
    const oldContext = monitorContexts.get(monitorType) ?? initialContext;
    const newContext = await runnable(oldContext as MonitorContext[T], time, traceId);

    monitorContexts.set(monitorType, newContext);

    return { success: true };
  } catch (thing: unknown) {
    const error = toError(thing);

    if (!error) {
      return { success: false, reason: `Unknown error: ${thing}` };
    }

    handleMonitorFailure(monitorType, error, traceId);
    return { success: false, reason: error.message };
  }
}

function handleMonitorFailure(monitorType: MonitorType, error: Error, traceId: string) {
  if (error instanceof DnsError) {
    if (isNetworkOutage) {
      return;
    }

    isNetworkOutage = true;

    severe(LOG_NAME, "Network outage detected. Future DNS errors will be suppressed.", traceId);
  }

  if (isNetworkOutage) {
    info(LOG_NAME, "Network outage resolved. Future DNS errors are resumed.", traceId);
  }

  isNetworkOutage = false;

  const reason = error.stack ? `${error.message}\n${getStack(error)}` : error.message;

  warn(LOG_NAME, `Failed to run ${monitorType}: ${reason}`, traceId);
}
