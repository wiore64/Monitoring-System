import { DnsError, getCode, ValidationError } from "#shared/error.js";
import { generateTraceId, info, severe, warn } from "#utils/logger.js";

import {
  type MonitorContext as BlackfileIndexContext,
  run as runBlackfileIndex,
} from "./list/blackfile-index/monitor.js";
import {
  type MonitorContext as FilianislostContext,
  run as runFilianislost,
} from "./list/filianislost/website/monitor.js";
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
  FilianislostWebsite: "filianislost/website",
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
  [MonitorType.FilianislostWebsite]: FilianislostContext;
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
  [MonitorType.FilianislostWebsite]: "./list/filianislost/website/monitor.js",
  [MonitorType.MinecraftInfo]: "./list/minecraft/info/monitor.js",
  [MonitorType.MinecraftState]: "./list/minecraft/state/monitor.js",
  [MonitorType.TwitterFilian]: "./list/socials/twitter/monitor.js",
  [MonitorType.TwitterWall]: "./list/filianislost/twitter/monitor.js",
  [MonitorType.Trademark]: "./list/other/trademarks/monitor.js",
  [MonitorType.YoutubeFilian]: "./list/socials/youtube/monitor.js",
} as const;

const MONITOR_REGISTRY: { [T in MonitorType]: MonitorExecutor<T> } = {
  [MonitorType.BlackfileIndex]: runBlackfileIndex,
  [MonitorType.FilianislostWebsite]: runFilianislost,
  [MonitorType.MinecraftInfo]: runMinecraftInfo,
  [MonitorType.MinecraftState]: runMinecraftState,
  [MonitorType.TwitterFilian]: runTwitterFilian,
  [MonitorType.TwitterWall]: runTwitterWall,
  [MonitorType.Trademark]: runTrademarks,
  [MonitorType.YoutubeFilian]: runYoutubeFilian,
};

const runningMonitors = new Set<MonitorType>();
const monitorIntervals = new Map<MonitorType, NodeJS.Timeout>();
const monitorContexts = new Map<MonitorType, object>();

let isNetworkOutageActive = false;

export function startMonitorInterval<T extends MonitorType>(
  monitorType: T,
  initialContext: MonitorContext[T],
  intervalMs: number,
): ServiceResult {
  if (monitorIntervals.has(monitorType)) {
    return {
      success: false,
      reason: `Monitor ${monitorType} already has an active interval`,
    };
  }

  const interval = setInterval(() => void runMonitor(monitorType, initialContext), intervalMs);
  monitorIntervals.set(monitorType, interval);

  return { success: true };
}

export function stopMonitorInterval(monitorType: MonitorType): ServiceResult {
  const interval = monitorIntervals.get(monitorType);

  if (!interval) {
    return {
      success: false,
      reason: `Monitor ${monitorType} does not have an active interval`,
    };
  }

  clearInterval(interval);
  monitorIntervals.delete(monitorType);

  monitorContexts.delete(monitorType);

  return { success: true };
}

export async function runMonitor<T extends MonitorType>(
  monitorType: T,
  initialContext: MonitorContext[T],
  time: Date = new Date(),
  traceId: string = generateTraceId(),
): Promise<ServiceResult> {
  if (runningMonitors.has(monitorType)) {
    return { success: false, reason: `Monitor ${monitorType} is already running` };
  }

  const executor = MONITOR_REGISTRY[monitorType];

  if (!executor) {
    throw new TypeError(`Monitor ${monitorType} is not registered`);
  }

  runningMonitors.add(monitorType);

  try {
    const context = monitorContexts.get(monitorType) ?? initialContext;
    const newContext = await executor(context as MonitorContext[T], time, traceId);

    monitorContexts.set(monitorType, newContext);
    updateNetworkOutageState(monitorType, false, traceId);

    return { success: true };
  } catch (cause: unknown) {
    if (!(cause instanceof Error)) {
      throw new ValidationError(`Non-error thrown: ${JSON.stringify(cause)}`, "NON_ERROR");
    }

    updateNetworkOutageState(monitorType, cause instanceof DnsError, traceId);

    warn(
      LOG_NAME,
      `Failed to run ${monitorType} (${getCode(cause) ?? cause.name}): ${cause.message}.\n\n${cause.stack ?? "No stack trace provided."}`,
      traceId,
    );

    return {
      success: false,
      reason: cause.message,
    };
  } finally {
    runningMonitors.delete(monitorType);
  }
}

function updateNetworkOutageState(
  monitorType: MonitorType,
  isNetworkOutage: boolean,
  traceId: string,
): void {
  if (isNetworkOutage === isNetworkOutageActive) {
    return;
  }

  isNetworkOutageActive = isNetworkOutage;

  if (isNetworkOutage) {
    severe(
      LOG_NAME,
      `Network outage detected, according to ${monitorType}. Future DNS errors will be suppressed.`,
      traceId,
    );
    return;
  }

  info(
    LOG_NAME,
    `Network outage resolved, according to ${monitorType}. Future DNS errors are now resumed.`,
    traceId,
  );
}
