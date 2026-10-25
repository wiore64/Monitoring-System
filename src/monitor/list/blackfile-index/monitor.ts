import config from "#data/blackfile-index/monitor-config.json" with { type: "json" };
import state from "#data/blackfile-index/monitor-state.json" with { type: "json" };
import { isDnsError, ValidationError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

import {
  buildMainPayload,
  buildWebsiteAvailablePayload,
  buildWebsiteUnavailablePayload,
} from "./payload-builder.js";

const LOG_NAME = "monitors/blackfile-index";
const MONITOR_STATE_PATH = "./data/blackfile-index/monitor-state.json";
const WEBSITE_STATE_PATH = "./data/blackfile-index/website-state.json";
const WEBSITE_URL = "https://blackfile-index.org";

export type MonitorContext = {
  timeoutMs: number;
};

type WebsiteState = {
  isAvailable: boolean;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const isWebsiteAvailableOld = readJsonFile<WebsiteState>(WEBSITE_STATE_PATH)?.isAvailable;
  const isWebsiteAvailableNew = await checkWebsiteAvailability(context.timeoutMs);

  if (state.messageId.length === 0 || isWebsiteAvailableOld == null) {
    await initializeMonitor(isWebsiteAvailableNew, config["channel-id"], traceId);
    return context;
  }

  if (isWebsiteAvailableNew === isWebsiteAvailableOld) {
    return context;
  }

  await reportUpdate(
    isWebsiteAvailableNew,
    isWebsiteAvailableOld,
    config["channel-id"],
    state.messageId,
    time,
    traceId,
  );
  writeJsonFile(WEBSITE_STATE_PATH, {
    isAvailable: isWebsiteAvailableNew,
  });

  return context;
}

async function checkWebsiteAvailability(timeoutMs: number): Promise<boolean> {
  const response = await fetchUrl(WEBSITE_URL, timeoutMs);

  if (response.success) {
    return true;
  }

  if (!isDnsError(response.error)) {
    return false;
  }

  throw response.error;
}

async function initializeMonitor(
  isWebsiteAvailable: boolean,
  channelId: string,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(isWebsiteAvailable, "N/A");
  const message = await sendMessage(channelId, payload);

  writeJsonFile(WEBSITE_STATE_PATH, {
    isAvailable: isWebsiteAvailable,
  });

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  debug(LOG_NAME, "Initialized.", traceId);
}

async function reportUpdate(
  isWebsiteAvailableNew: boolean,
  isWebsiteAvailableOld: boolean,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(isWebsiteAvailableNew, time.toUTCString());
  await editMessage(mainPayload, channelId, messageId);

  if (isWebsiteAvailableNew && !isWebsiteAvailableOld) {
    const updatePayload = buildWebsiteAvailablePayload(time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, "Website became available.", traceId);
    return;
  }

  if (!isWebsiteAvailableNew && isWebsiteAvailableOld) {
    const updatePayload = buildWebsiteUnavailablePayload(time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, "Website became unavailable.", traceId);
    return;
  }

  throw new ValidationError(
    `Impossible state. New result: ${isWebsiteAvailableNew}; old result: ${isWebsiteAvailableOld}`,
  );
}
