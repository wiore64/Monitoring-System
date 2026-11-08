import crypto from "node:crypto";

import config from "#data/filianislost/monitor-config.json" with { type: "json" };
import state from "#data/filianislost/monitor-state.json" with { type: "json" };
import { readFile, writeFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "filianislost";
const MONITOR_STATE_PATH = "./data/filianislost/monitor-state.json";
const WEBSITE_STATE_PATH = "./data/filianislost/website-hash.txt";
const WEBSITE_URL = "https://filianislost.com";

export type MonitorContext = {
  timeoutMs: number;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldHash = readFile(WEBSITE_STATE_PATH);
  const newHash = await fetchWebsiteHash(context.timeoutMs);

  if (state.messageId.length === 0 || !oldHash) {
    await initializeMonitor(newHash, config["channel-id"], traceId);
    return context;
  }

  if (newHash === oldHash) {
    return context;
  }

  await reportUpdate(config["channel-id"], state.messageId, time, traceId);
  writeFile(WEBSITE_STATE_PATH, newHash);

  return context;
}

async function fetchWebsiteHash(timeoutMs: number): Promise<string> {
  const response = await fetchUrl(WEBSITE_URL, timeoutMs);

  if (!response.success) {
    throw response.error;
  }

  const text = await response.data.text();

  return crypto.hash("sha256", text.substring(0, text.indexOf("cloudflare")));
}

async function initializeMonitor(hash: string, channelId: string, traceId: string): Promise<void> {
  const message = await sendMessage(channelId, buildMainPayload("N/A"));

  writeFile(WEBSITE_STATE_PATH, hash);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  debug(LOG_NAME, `Initialized.`, traceId);
}

async function reportUpdate(
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  await editMessage(channelId, messageId, buildMainPayload(time.toUTCString()));
  await sendMessage(channelId, buildUpdatePayload(time));

  info(LOG_NAME, "Website has been updated.", traceId);
}
