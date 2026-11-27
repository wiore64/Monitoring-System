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
const WEBSITE_HTML_URL = "https://filianislost.com";
const WEBSITE_JS_URL = "https://filianislost.com/viewer.js";

export type MonitorContext = {
  timeoutMs: number;
};

export async function run(
  ctx: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldHash = readFile(WEBSITE_STATE_PATH);
  const newHash = await fetchWebsiteHash(ctx.timeoutMs);

  if (state.messageId.length === 0) {
    await initializeMonitor(newHash, config["channel-id"], traceId);
    return ctx;
  }

  if (oldHash.length === 0) {
    writeFile(WEBSITE_STATE_PATH, newHash);
    debug(LOG_NAME, "Old hash not found. New one persisted.", traceId);
    return ctx;
  }

  if (newHash === oldHash) {
    return ctx;
  }

  await reportUpdate(config["channel-id"], state.messageId, time, traceId);
  writeFile(WEBSITE_STATE_PATH, newHash);

  return ctx;
}

async function fetchWebsiteHash(timeoutMs: number): Promise<string> {
  const responseHtml = await fetchUrl(LOG_NAME, WEBSITE_HTML_URL, timeoutMs);
  const responseJs = await fetchUrl(LOG_NAME, WEBSITE_JS_URL, timeoutMs);

  if (!responseHtml.success) {
    throw responseHtml.error;
  }

  if (!responseJs.success) {
    throw responseJs.error;
  }

  const textHtml = await responseHtml.data.text();
  const textJs = await responseJs.data.text();

  return crypto.hash(
    "sha256",
    textHtml + textJs,
  );
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
