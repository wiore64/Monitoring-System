import config from "#data/scheduler/scheduler-config.json" with { type: "json" };
import {
  MONITOR_PATHS,
  MonitorType,
  runMonitor,
  startMonitorInterval,
} from "#monitor/monitor-service.js";
import { debug, generateTraceId } from "#utils/logger.js";

const LOG_NAME = "Scheduler Service";

export function initialize(traceId: string = generateTraceId()): void {
  debug(LOG_NAME, "Initializing...", traceId);

  for (const [monitorType] of Object.entries(config)) {
    if (monitorType === MonitorType.FilianislostWebsite) {
      continue;
    }

    initiateMonitor(monitorType as MonitorType);
  }

  debug(LOG_NAME, "Initialized.", traceId);
}

function initiateMonitor(monitorType: MonitorType): void {
  switch (monitorType) {
    case MonitorType.BlackfileIndex:
      startMonitorInterval(
        monitorType,
        {
          timeoutMs: config[monitorType].timeout,
        },
        config[monitorType].interval,
      );
      break;

    case MonitorType.FilianislostWebsite:
      startMonitorInterval(
        monitorType,
        {
          timeoutMs: config[monitorType].timeout,
        },
        config[monitorType].interval,
      );
      break;

    //     case MonitorType.TwitterWall:
    //       startMonitorInterval(
    //         monitor.type,
    //         {
    //           "timeout-ms": monitor.config.initial.timeout,
    //         },
    //         monitor.config.initial.interval,
    //       );
    //       break;

    case MonitorType.MinecraftInfo:
      startMonitorInterval(
        monitorType,
        {
          timeoutMs: config[monitorType].timeout,
        },
        config[monitorType].interval,
      );
      // setInterval(() => void adjustMinecraftInfoMonitor(), config[monitorType].adjustment.interval);
      break;

    //     case MonitorType.MinecraftState:
    //       startMonitorInterval(
    //         monitor.type,
    //         {
    //           "timeout-ms": monitor.config.initial.timeout,
    //         },
    //         monitor.config.initial.interval,
    //       );
    //       setInterval(() => void adjustMinecraftStateMonitor(), monitor.config.adjustment.interval);
    //       break;

    //     case MonitorType.TwitterFilian:
    //       startMonitorInterval(
    //         monitor.type,
    //         {
    //           "timeout-ms": monitor.config.initial.timeout,
    //         },
    //         monitor.config.initial.interval,
    //       );
    //       break;

    case MonitorType.Trademark:
      startMonitorInterval(
        monitorType,
        {
          timeoutMs: config[monitorType].timeout,
        },
        config[monitorType].interval,
      );
      break;

    //     case MonitorType.YoutubeFilian:
    //       startMonitorInterval(
    //         monitor.type,
    //         {
    //           "timeout-ms": monitor.config.initial.timeout,
    //         },
    //         monitor.config.initial.interval,
    //       );
    //       break;

    //     default:
    //       throw new TypeError(`Unknown monitor type: ${JSON.stringify(monitor)}`);
  }
}

// async function adjustMinecraftStateMonitor(): Promise<void> {
//   const { schedulerHooks } = await import(MONITOR_PATHS[MonitorType.MinecraftState]);
// }

async function adjustMinecraftInfoMonitor(): Promise<void> {
  const { schedulerHooks } = await import(MONITOR_PATHS[MonitorType.MinecraftInfo]);
}
