import { Client } from "discord.js";

import { info, generateTraceId } from "#utils/logger.js";
import { config } from "./config.js";

const LOG_NAME = "bootstrap";

export const client = new Client({
  intents: [],
});

async function run(): Promise<void> {
  const traceId = generateTraceId();

  await client.login(config.botToken);
  await initMonitor(traceId);

  info(LOG_NAME, "Ready!", traceId);
}

async function initMonitor(traceId: string): Promise<void> {
  const service = await import("#monitor/scheduler-service.js");

  service.initialize(traceId);
}

run();
