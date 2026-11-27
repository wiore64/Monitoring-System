import { client } from "#shared/client.js";
import { createDirectory } from "#utils/file.js";
import { info, generateTraceId } from "#utils/logger.js";
import { CONFIG } from "./config.js";

const LOG_NAME = "bootstrap";

async function run(): Promise<void> {
  const traceId = generateTraceId();

  await client.login(CONFIG.botToken);

  // Make sure these two exist.
  createDirectory("./data");
  createDirectory("./logs");

  await initMonitor(traceId);

  info(LOG_NAME, "Ready!", traceId);
}

async function initMonitor(traceId: string): Promise<void> {
  const service = await import("#monitor/scheduler-service.js");

  service.initialize(traceId);
}

run();
