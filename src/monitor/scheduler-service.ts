import config from "#data/scheduler/scheduler-config.json" with { type: "json" };
import { MonitorType, type ServiceResult, startMonitorInterval } from "#monitor/monitor-service.js";
import { debug, severe, generateTraceId } from "#utils/logger.js";

const LOG_NAME = "Scheduler Service";

export function initialize(traceId: string = generateTraceId()): void {
  debug(LOG_NAME, "Initializing...", traceId);

  for (const monitor of Object.keys(config) as MonitorType[]) {
    if (
      monitor === MonitorType.Filianislost ||
      monitor === MonitorType.BlackfileIndex ||
      monitor === MonitorType.MinecraftInfo ||
      monitor === MonitorType.Trademark ||
      monitor === MonitorType.YoutubeFilian
    ) {
      const result = initiateMonitor(monitor);

      if (!result.success) {
        severe(LOG_NAME, `Failed to schedule ${monitor}: ${result.reason}`, traceId);
      } else {
        debug(
          LOG_NAME,
          `Successfully scheduled: ${monitor} every ${config[monitor].interval}ms`,
          traceId,
        );
      }
    }
  }

  debug(LOG_NAME, "Initialized.", traceId);
}

function initiateMonitor(monitor: MonitorType): ServiceResult {
  return startMonitorInterval(
    monitor,
    {
      timeoutMs: config[monitor].timeout,
    },
    config[monitor].interval,
  );
}
