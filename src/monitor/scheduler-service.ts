import { MONITOR_PATHS, MonitorType, startMonitorInterval } from "#monitor/monitor-service.js";
import { readJsonFile } from "#utils/file.js";
import { debug, generateTraceId } from "#utils/logger.js";

const LOG_NAME = "Scheduler Service";
const SCHEDULER_CONFIG_PATH = "./data/scheduler/scheduler-config.json";

type MonitorSchedule = {
  interval: number;
  timeout: number;
};

type SchedulerConfig = {
  [MonitorType.BlackfileIndex]: {
    initial: MonitorSchedule;
  };
  [MonitorType.FilianislostAssets]: {
    initial: MonitorSchedule;
  };
  [MonitorType.FilianislostStats]: {
    initial: MonitorSchedule;
  };
  [MonitorType.MinecraftInfo]: {
    initial: MonitorSchedule;
    adjustment: {
      interval: number;
      restart: MonitorSchedule;
      offline: MonitorSchedule;
    };
  };
  [MonitorType.MinecraftState]: {
    initial: MonitorSchedule;
    adjustment: {
      interval: number;
      restart: MonitorSchedule;
      offline: MonitorSchedule;
    };
  };
  [MonitorType.TwitterWall]: {
    initial: MonitorSchedule;
  };
  [MonitorType.TwitterFilian]: {
    initial: MonitorSchedule;
  };
  [MonitorType.YoutubeFilian]: {
    initial: MonitorSchedule;
  };
};

type SchedulerMonitor = {
  [T in MonitorType]: {
    type: T;
    config: SchedulerConfig[T];
  };
}[MonitorType];

export function initialize(traceId: string = generateTraceId()): void {
  debug(LOG_NAME, "Initializing...", traceId);

  const config = readJsonFile<SchedulerConfig>(SCHEDULER_CONFIG_PATH);

  for (const [monitorType, monitorConfig] of Object.entries(config)) {
    // Entry is guaranteed to be a valid SchedulerMonitorConfig because I trust myself
    initiateMonitor({
      type: monitorType,
      config: monitorConfig,
    } as SchedulerMonitor);
  }

  debug(LOG_NAME, "Initialized.", traceId);
}

function initiateMonitor(monitor: SchedulerMonitor): void {
  switch (monitor.type) {
    case MonitorType.BlackfileIndex:
      startMonitorInterval(
        monitor.type,
        {
          "timeout-ms": monitor.config.initial.timeout,
        },
        monitor.config.initial.interval,
      );
      break;

    case MonitorType.FilianislostAssets:
      startMonitorInterval(
        monitor.type,
        {
          "timeout-ms": monitor.config.initial.timeout,
        },
        monitor.config.initial.interval,
      );
      break;

    case MonitorType.FilianislostStats:
      startMonitorInterval(
        monitor.type,
        {
          "timeout-ms": monitor.config.initial.timeout,
        },
        monitor.config.initial.interval,
      );
      break;

    case MonitorType.MinecraftInfo:
      startMonitorInterval(
        monitor.type,
        {
          "timeout-ms": monitor.config.initial.timeout,
        },
        monitor.config.initial.interval,
      );
      setInterval(() => void adjustMinecraftInfoMonitor(), monitor.config.adjustment.interval);
      break;

    case MonitorType.MinecraftState:
      startMonitorInterval(
        monitor.type,
        {
          "timeout-ms": monitor.config.initial.timeout,
        },
        monitor.config.initial.interval,
      );
      setInterval(() => void adjustMinecraftStateMonitor(), monitor.config.adjustment.interval);
      break;

    case MonitorType.TwitterWall:
      startMonitorInterval(
        monitor.type,
        {
          "timeout-ms": monitor.config.initial.timeout,
        },
        monitor.config.initial.interval,
      );
      break;

    case MonitorType.TwitterFilian:
      startMonitorInterval(
        monitor.type,
        {
          "timeout-ms": monitor.config.initial.timeout,
        },
        monitor.config.initial.interval,
      );
      break;

    case MonitorType.YoutubeFilian:
      startMonitorInterval(
        monitor.type,
        {
          "timeout-ms": monitor.config.initial.timeout,
        },
        monitor.config.initial.interval,
      );
      break;

    default:
      throw new TypeError(`Unknown monitor type: ${JSON.stringify(monitor)}`);
  }
}

async function adjustMinecraftStateMonitor(): Promise<void> {
  const { schedulerHooks } = await import(MONITOR_PATHS[MonitorType.MinecraftState]);
}

async function adjustMinecraftInfoMonitor(): Promise<void> {
  const { schedulerHooks } = await import(MONITOR_PATHS[MonitorType.MinecraftInfo]);
}
