import config from "#data/filianislost/website/monitor-config.json" with { type: "json" };
import state from "#data/filianislost/website/monitor-state.json" with { type: "json" };
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";
import { fetchUrl } from "#utils/network.js";
import { findDifference, formatTimestamp } from "#utils/time.js";

import {
  buildMainPayload,
  buildWebsiteAvailablePayload,
  buildWebsiteReturnPayload,
  buildWebsiteUnavailablePayload,
} from "./payload-builder.js";

const LOG_NAME = "filianislost/website";
const MONITOR_STATE_PATH = "./data/filianislost/website/monitor-state.json";
const WEBSITE_STATE_PATH = "./data/filianislost/website/website-state.json";
const WEBSITE_URL = "https://filianislost.com";

export type MonitorContext = {
  timeoutMs: number;
};

type WebsiteState = {
  hasEverReturned: boolean;
  isAvailable: boolean;
  lastAvailabilityChangeTimestamp: string;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldWebsiteState = readJsonFile<WebsiteState>(WEBSITE_STATE_PATH);
  const isWebsiteAvailable = await checkWebsiteAvailability(context.timeoutMs);

  if (state.messageId.length === 0 || !oldWebsiteState) {
    await initializeMonitor(isWebsiteAvailable, config["channel-id"], time, traceId);
    return context;
  }

  if (isWebsiteAvailable === oldWebsiteState.isAvailable) {
    return context;
  }

  debug(
    LOG_NAME,
    `Website availability changed: ${isWebsiteAvailable}. Old state: ${JSON.stringify(oldWebsiteState)}`,
    traceId,
  );

  await reportUpdate(
    isWebsiteAvailable,
    oldWebsiteState,
    config["channel-id"],
    state.messageId,
    time,
    traceId,
  );
  persistWebsiteStateUpdate(oldWebsiteState.hasEverReturned, isWebsiteAvailable, time);

  return context;
}

async function checkWebsiteAvailability(timeoutMs: number): Promise<boolean> {
  const response = await fetchUrl(WEBSITE_URL, timeoutMs);

  if (response.success) {
    return response.data.ok;
  }

  // Does EAI_AGAIN belong here?
  if (["ENOTFOUND", "EAI_AGAIN"].includes(response.error.code)) {
    return false;
  }

  throw response.error;
}

async function initializeMonitor(
  isWebsiteAvailable: boolean,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(isWebsiteAvailable, "N/A");
  const message = await sendMessage(payload, channelId);

  persistWebsiteStateUpdate(isWebsiteAvailable, isWebsiteAvailable, time);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  info(LOG_NAME, `Initialized.`, traceId);
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

  const duration = formatTimestamp(
    findDifference(time, oldWebsiteState.lastAvailabilityChangeTimestamp),
  );

  if (isWebsiteAvailable && !oldWebsiteState.hasEverReturned) {
    const updatePayload = buildWebsiteReturnPayload(duration, time);
    await sendMessage(updatePayload, channelId);

    info(LOG_NAME, `Website is finally back after ${duration}!`, traceId);
    return;
  }

  const updatePayload = isWebsiteAvailable
    ? buildWebsiteAvailablePayload(duration, time)
    : buildWebsiteUnavailablePayload(duration, time);
  await sendMessage(updatePayload, channelId);

  info(
    LOG_NAME,
    `Website ${isWebsiteAvailable ? "is back online" : "went down"} after ${duration}.`,
    traceId,
  );
}

function persistWebsiteStateUpdate(
  hasEverReturned: boolean,
  isWebsiteAvailable: boolean,
  time: Date,
): void {
  writeJsonFile(WEBSITE_STATE_PATH, {
    hasReturned: hasEverReturned || isWebsiteAvailable,
    isAvailable: isWebsiteAvailable,
    lastAvailabilityChangeTimestamp: time.toISOString(),
  });
}
