import { DnsError, getStack, toError } from "#shared/error.js";
import { generateTraceId, info, severe, warn } from "#utils/logger.js";

import {
  type MonitorContext as BlackfileIndexContext,
  run as runBlackfileIndex,
} from "./list/blackfile-index/monitor.js";
import {
  type MonitorContext as FilianislostAssetsContext,
  run as runFilianislostAssets,
} from "./list/filianislost/assets/monitor.js";
import {
  type MonitorContext as FilianislostStatsContext,
  run as runFilianislostStats,
} from "./list/filianislost/stats/monitor.js";
import {
  type MonitorContext as TwitterWallContext,
  run as runTwitterWall,
} from "./list/filianislost/twitter/monitor.js";
import {
  type MonitorContext as MinecraftInfoContext,
  run as runMinecraftInfo,
} from "./list/minecraft/info/monitor.js";
import {
  type MonitorContext as MinecraftStateContext,
  run as runMinecraftState,
} from "./list/minecraft/state/monitor.js";
import {
  type MonitorContext as TwitterFilianContext,
  run as runTwitterFilian,
} from "./list/socials/twitter/monitor.js";
import {
  type MonitorContext as TrademarkContext,
  run as runTrademarks,
} from "./list/other/trademarks/monitor.js";
import {
  type MonitorContext as YoutubeFilianContext,
  run as runYoutubeFilian,
} from "./list/socials/youtube/monitor.js";

const LOG_NAME = "Monitor Service";

export const MonitorType = {
  BlackfileIndex: "blackfile-index",
  FilianislostAssets: "filianislost-assets",
  FilianislostStats: "filianislost-stats",
  MinecraftInfo: "minecraft-info",
  MinecraftState: "minecraft-state",
  TwitterFilian: "twitter-filian",
  TwitterWall: "twitter-wall",
  Trademark: "trademarks",
  YoutubeFilian: "youtube-filian",
} as const;

export type MonitorType = (typeof MonitorType)[keyof typeof MonitorType];

type MonitorContext = {
  [MonitorType.BlackfileIndex]: BlackfileIndexContext;
  [MonitorType.FilianislostAssets]: FilianislostAssetsContext;
  [MonitorType.FilianislostStats]: FilianislostStatsContext;
  [MonitorType.MinecraftInfo]: MinecraftInfoContext;
  [MonitorType.MinecraftState]: MinecraftStateContext;
  [MonitorType.TwitterFilian]: TwitterFilianContext;
  [MonitorType.TwitterWall]: TwitterWallContext;
  [MonitorType.Trademark]: TrademarkContext;
  [MonitorType.YoutubeFilian]: YoutubeFilianContext;
};

type MonitorExecutor<T extends MonitorType> = (
  context: MonitorContext[T],
  time: Date,
  traceId: string,
) => Promise<MonitorContext[T]>;

type ServiceResult = { success: true } | { success: false; reason: string };

export const MONITOR_PATHS: Record<MonitorType, string> = {
  [MonitorType.BlackfileIndex]: "./list/blackfile-index/monitor.js",
  [MonitorType.FilianislostAssets]: "./list/filianislost/assets/monitor.js",
  [MonitorType.FilianislostStats]: "./list/filianislost/stats/monitor.js",
  [MonitorType.MinecraftInfo]: "./list/minecraft/info/monitor.js",
  [MonitorType.MinecraftState]: "./list/minecraft/state/monitor.js",
  [MonitorType.TwitterFilian]: "./list/twitter/filian/monitor.js",
  [MonitorType.TwitterWall]: "./list/twitter/wall/monitor.js",
  [MonitorType.Trademark]: "./list/trademark/monitor.js",
  [MonitorType.YoutubeFilian]: "./list/youtube/filian/monitor.js",
} as const;

const MONITOR_REGISTRY: { [T in MonitorType]: MonitorExecutor<T> } = {
  [MonitorType.BlackfileIndex]: runBlackfileIndex,
  [MonitorType.FilianislostAssets]: runFilianislostAssets,
  [MonitorType.FilianislostStats]: runFilianislostStats,
  [MonitorType.MinecraftInfo]: runMinecraftInfo,
  [MonitorType.MinecraftState]: runMinecraftState,
  [MonitorType.TwitterFilian]: runTwitterFilian,
  [MonitorType.TwitterWall]: runTwitterWall,
  [MonitorType.Trademark]: runTrademarks,
  [MonitorType.YoutubeFilian]: runYoutubeFilian,
} as const;

const monitorIntervals: Map<MonitorType, NodeJS.Timeout> = new Map();
const monitorContexts: Map<MonitorType, object> = new Map();

let isNetworkOutage = false;

export function startMonitorInterval<T extends MonitorType>(
  monitorType: T,
  initialContext: MonitorContext[T],
  intervalMs: number,
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

    // old context is guaranteed to be of type MonitorContext[T]
    const newContext = await runnable(oldContext as MonitorContext[T], time, traceId);

    monitorContexts.set(monitorType, newContext);

    return { success: true };
  } catch (thing: unknown) {
    const error = toError(thing);

    if (!error) {
      throw new TypeError(`Unknown error: ${thing}`, { cause: thing });
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
    return;
  }

  if (isNetworkOutage) {
    isNetworkOutage = false;

    info(LOG_NAME, "Network outage resolved. Future DNS errors are resumed.", traceId);
  }

  const reason = error.stack ? `${error.message}\n${getStack(error)}` : error.message;

  warn(LOG_NAME, `Failed to run ${monitorType}: ${reason}`, traceId);
}
