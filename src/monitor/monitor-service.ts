import { DnsError, getStack, toError } from "#shared/error.js";
import { generateTraceId, info, severe, warn } from "#utils/logger.js";

import { run as runBlackfileIndex } from "./list/blackfile-index/monitor.js";
import { run as runFilianislost } from "./list/filianislost/monitor.js";
import { run as runMinecraftInfo } from "./list/minecraft/info/monitor.js";
import { run as runMinecraftState } from "./list/minecraft/state/monitor.js";
import { run as runTwitter } from "./list/twitter/monitor.js";
import { run as runYoutube } from "./list/youtube/monitor.js";

const LOG_NAME = "Monitor Service";

export const MonitorType = {
  BlackfileIndex: "blackfile-index",
  Filianislost: "filianislost",
  MinecraftInfo: "minecraft-info",
  MinecraftState: "minecraft-state",
  Twitter: "twitter",
  Youtube: "youtube",
} as const;

type MonitorType = (typeof MonitorType)[keyof typeof MonitorType];
type ServiceResult = { success: true } | { success: false; reason: string };
type MonitorRunner = (context: object, time: Date, traceId: string) => Promise<object>;

const MONITOR_REGISTRY: Record<MonitorType, MonitorRunner> = {
  "blackfile-index": runBlackfileIndex,
  filianislost: runFilianislost,
  "minecraft-info": runMinecraftInfo,
  "minecraft-state": runMinecraftState,
  twitter: runTwitter,
  youtube: runYoutube,
};

const monitorIntervals: Map<MonitorType, NodeJS.Timeout> = new Map();
const monitorContexts: Map<MonitorType, object> = new Map();
let isNetworkOutage = false;

export function runMonitorInterval(monitorType: MonitorType, intervalMs: number): ServiceResult {
  if (isMonitorInInterval(monitorType)) {
    return { success: false, reason: `Monitor ${monitorType} is already in interval` };
  }

  monitorIntervals.set(
    monitorType,
    setInterval(() => void runMonitor(monitorType), intervalMs),
  );

  return { success: true };
}

export function stopMonitorInterval(monitorType: MonitorType) {
  if (!isMonitorInInterval(monitorType)) {
    return { success: false, reason: `Monitor ${monitorType} is not in interval` };
  }

  clearInterval(monitorIntervals.get(monitorType));

  monitorIntervals.delete(monitorType);
  monitorContexts.delete(monitorType);

  return { success: true };
}

export function isMonitorInInterval(monitorType: MonitorType): boolean {
  return monitorIntervals.has(monitorType);
}

export async function runMonitor(
  monitorType: MonitorType,
  initialContext: object = {},
  time: Date = new Date(),
  traceId: string = generateTraceId(),
): Promise<ServiceResult> {
  const runnable = MONITOR_REGISTRY[monitorType];
  if (!runnable) {
    throw new TypeError(`Monitor ${monitorType} is not registered.`);
  }

  try {
    const oldContext = monitorContexts.get(monitorType) ?? initialContext;
    const newContext = await runnable(oldContext, time, traceId);

    monitorContexts.set(monitorType, newContext);

    return { success: true };
  } catch (thing: unknown) {
    const error = toError(thing);

    if (!error) {
      return { success: false, reason: `Unknown error: ${thing}` };
    }

    const cause = error.cause;
    const causeError = toError(cause);

    handleMonitorFailure(monitorType, causeError ?? error, traceId);
    return { success: false, reason: causeError?.message ?? error.message };
  }
}

function handleMonitorFailure(monitorType: MonitorType, error: Error, traceId: string) {
  if (error instanceof DnsError) {
    if (isNetworkOutage) {
      return;
    }

    isNetworkOutage = true;

    severe(
      LOG_NAME,
      "A network outage has been detected. Future DNS errors will be suppressed.",
      traceId,
    );
  }

  if (isNetworkOutage) {
    info(
      LOG_NAME,
      "The network outage has been resolved. Future DNS errors are now allowed.",
      traceId,
    );
  }

  isNetworkOutage = false;

  warn(LOG_NAME, `An error occurred while running ${monitorType}: ${getStack(error)}.`, traceId);
}
