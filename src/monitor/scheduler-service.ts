import { debug, generateTraceId } from "#utils/logger.js";

import { MonitorType, stopMonitorInterval, runMonitor } from "./monitor-service.js";

const LOG_NAME = "Scheduler Service";

export function start(traceId: string = generateTraceId()): void {
  debug(LOG_NAME, "Initializing...", traceId);

  debug(LOG_NAME, "Initialized.", traceId);
}
