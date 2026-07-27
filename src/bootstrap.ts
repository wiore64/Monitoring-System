import { Client } from "discord.js";

import { config } from "./config.js";
import { info, generateTraceId } from "#utils/logger.js";

export const client = new Client({
  intents: [],
});

const LOG_NAME = "bootstrap";

async function run(): Promise<void> {
  const traceId = generateTraceId();

  await client.login(config.botToken);
  await initMonitor(traceId);

  info(LOG_NAME, "Ready!", traceId);
}

async function initMonitor(traceId: string): Promise<void> {
  const service = await import("#monitor/scheduler-service.js");
  service.start(traceId);
}

await run();
