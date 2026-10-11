import config from "#data/blackfile-index/monitor-config.json" with { type: "json" };
import state from "#data/blackfile-index/monitor-state.json" with { type: "json" };
import { getCode, isDnsError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info, warn } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";

import {
  buildMainPayload,
  buildWebsiteAvailablePayload,
  buildWebsiteUnavailablePayload,
} from "./payload-builder.js";

const LOG_NAME = "monitor/blackfile-index";

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
  const oldWebsiteState = readJsonFile<WebsiteState>(WEBSITE_STATE_PATH);
  const isWebsiteAvailable = await checkWebsiteAvailability(context.timeoutMs);

  if (state.messageId.length == 0 || !oldWebsiteState) {
    await initializeMonitor(isWebsiteAvailable, config["channel-id"], traceId);
    return context;
  }

  if (isWebsiteAvailable == oldWebsiteState.isAvailable) {
    return context;
  }

  await reportUpdate(
    isWebsiteAvailable,
    oldWebsiteState,
    config["channel-id"],
    state.messageId,
    time,
    traceId,
  );
  persistWebsiteStateUpdate(isWebsiteAvailable);

  return context;
}

async function checkWebsiteAvailability(timeoutMs: number): Promise<boolean> {
  const response = await fetchUrl(WEBSITE_URL, timeoutMs);

  if (response.success) {
    return true;
  }

  if (!isDnsError(response.error) || getCode(response.error) === "ENOTFOUND") {
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

  persistWebsiteStateUpdate(isWebsiteAvailable);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  debug(LOG_NAME, "Initialized.", traceId);
}

async function reportUpdate(
  isWebsiteAvailable: boolean,
  oldWebsiteState: WebsiteState,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(isWebsiteAvailable, time.toUTCString());
  await editMessage(mainPayload, channelId, messageId);

  if (isWebsiteAvailable && !oldWebsiteState.isAvailable) {
    const updatePayload = buildWebsiteAvailablePayload(time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, "Website became available.", traceId);
    return;
  }

  if (!isWebsiteAvailable && oldWebsiteState.isAvailable) {
    const updatePayload = buildWebsiteUnavailablePayload(time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, "Website became unavailable.", traceId);
    return;
  }

  warn(
    LOG_NAME,
    `Unexpected website state. Is website available? ${isWebsiteAvailable}. And according to the old state? ${oldWebsiteState.isAvailable}`,
    traceId,
  );
}

function persistWebsiteStateUpdate(isWebsiteAvailable: boolean): void {
  writeJsonFile(WEBSITE_STATE_PATH, {
    isAvailable: isWebsiteAvailable,
  });
}
