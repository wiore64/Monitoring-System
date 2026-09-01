import config from "#data/blackfile-index/monitor-config.json" with { type: "json" };
import state from "#data/blackfile-index/monitor-state.json" with { type: "json" };
import { getCause, getCode, translateNetworkError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";
import { findDifference, formatTimestamp } from "#utils/time.js";

import {
  buildMainPayload,
  buildWebsiteAvailablePayload,
  buildWebsiteReturnPayload,
  buildWebsiteUnavailablePayload,
} from "./payload-builder.js";

const LOG_NAME = "blackfile-index";
const MONITOR_STATE_PATH = "./data/blackfile-index/monitor-state.json";
const WEBSITE_STATE_PATH = "./data/blackfile-index/website-state.json";

export type MonitorContext = {
  timeoutMs: number;
};

type WebsiteState = {
  hasReturned: boolean;
  isAvailable: boolean;
  lastAvailabilityChangeTimestamp: string;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldWebsiteState = readJsonFile<WebsiteState>(WEBSITE_STATE_PATH);
  const isWebsiteAvailable = await checkWebsiteAvailability(context.timeoutMs, traceId);

  if (state.messageId.length === 0) {
    await initializeMonitor(isWebsiteAvailable, oldWebsiteState, config["channel-id"], traceId);
    return context;
  }

  if (isWebsiteAvailable === oldWebsiteState.isAvailable) {
    return context;
  }

  debug(
    LOG_NAME,
    `Website status changed to ${isWebsiteAvailable}. Old state: ${JSON.stringify(oldWebsiteState)}`,
    traceId,
  );

  await handleUpdate(
    isWebsiteAvailable,
    oldWebsiteState,
    config["channel-id"],
    state.messageId,
    time,
    traceId,
  );

  return context;
}

async function initializeMonitor(
  isWebsiteAvailable: boolean,
  websiteState: WebsiteState,
  channelId: string,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(isWebsiteAvailable, new Date("2026-05-07T03:40:00Z"));
  const message = await sendMessage(channelId, payload);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  websiteState.hasReturned = isWebsiteAvailable;
  websiteState.isAvailable = isWebsiteAvailable;
  websiteState.lastAvailabilityChangeTimestamp = "2026-05-07T03:40:00Z";
  writeJsonFile(WEBSITE_STATE_PATH, websiteState);

  info(LOG_NAME, "Initialized.", traceId);
}

async function checkWebsiteAvailability(timeoutMs: number, traceId: string): Promise<boolean> {
  try {
    const response = await fetch("https://blackfile-index.org", {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch (thing: unknown) {
    if (!(thing instanceof Error)) {
      throw new TypeError(`Non-error thrown: ${thing}`, { cause: thing });
    }

    const networkError = translateNetworkError(thing);

    // Should note what actual errors are thrown here. Perhaps use error codes here instead.
    if (getCode(networkError) !== "ENOTFOUND") {
      debug(LOG_NAME, `Error code: ${getCode(getCause(networkError) ?? networkError)}`, traceId);
      throw networkError;
    }

    return false;
  }
}

async function handleUpdate(
  isWebsiteAvailable: boolean,
  websiteState: WebsiteState,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(isWebsiteAvailable, time);
  await editMessage(channelId, messageId, mainPayload);

  const formattedDuration = formatTimestamp(
    findDifference(websiteState.lastAvailabilityChangeTimestamp, time),
  );

  if (isWebsiteAvailable && !websiteState.hasReturned) {
    const updatePayload = buildWebsiteReturnPayload(formattedDuration, time);
    await sendMessage(channelId, updatePayload);

    websiteState.hasReturned = true;
    websiteState.isAvailable = isWebsiteAvailable;
    websiteState.lastAvailabilityChangeTimestamp = time.toUTCString();
    writeJsonFile(WEBSITE_STATE_PATH, websiteState);

    info(LOG_NAME, `Website is finally back after ${formattedDuration}!`, traceId);
    return;
  }

  const updatePayload = isWebsiteAvailable
    ? buildWebsiteAvailablePayload(formattedDuration, time)
    : buildWebsiteUnavailablePayload(formattedDuration, time);
  await sendMessage(channelId, updatePayload);

  websiteState.isAvailable = isWebsiteAvailable;
  websiteState.lastAvailabilityChangeTimestamp = time.toUTCString();
  writeJsonFile(WEBSITE_STATE_PATH, websiteState);

  info(LOG_NAME, `Website ${isWebsiteAvailable ? "is back online" : "went down"}.`, traceId);
}
