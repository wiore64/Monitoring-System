import config from "#data/blackfile-index/monitor-config.json" with { type: "json" };
import state from "#data/blackfile-index/monitor-state.json" with { type: "json" };
import { getCause, getCode, translateNetworkError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info, warn } from "#utils/logger.js";
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

const INITIAL_LAST_AVAILABILITY_CHANGE_TIME = new Date("2026-05-07T03:40:00Z");
const INITIAL_WEBSITE_STATE: WebsiteState = {
  hasReturned: false,
  isAvailable: false,
  lastAvailabilityChangeTimestamp: INITIAL_LAST_AVAILABILITY_CHANGE_TIME.toISOString(),
};

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

  if (state.messageId.length === 0 || !oldWebsiteState) {
    await initializeMonitor(isWebsiteAvailable, config["channel-id"], traceId);
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
  persistWebsiteStateUpdate(isWebsiteAvailable, oldWebsiteState, time);

  return context;
}

async function checkWebsiteAvailability(timeoutMs: number, traceId: string): Promise<boolean> {
  try {
    const response = await fetch("https://blackfile-index.org", {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch (thing: unknown) {
    if (!(thing instanceof Error)) {
      throw new TypeError(`[${traceId}] Non-error thrown: ${thing}`, { cause: thing });
    }

    const networkError = translateNetworkError(thing);

    // Should note what actual errors are thrown here. Perhaps use error codes here instead.
    if (getCode(networkError) !== "ENOTFOUND") {
      warn(
        LOG_NAME,
        `Received error code: ${getCode(getCause(networkError) ?? networkError)}`,
        traceId,
      );
      throw networkError;
    }

    return false;
  }
}

async function initializeMonitor(
  isWebsiteAvailable: boolean,
  channelId: string,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(isWebsiteAvailable, INITIAL_LAST_AVAILABILITY_CHANGE_TIME);
  const message = await sendMessage(channelId, payload);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  writeJsonFile(WEBSITE_STATE_PATH, INITIAL_WEBSITE_STATE);

  info(LOG_NAME, "Initialized.", traceId);
}

async function reportUpdate(
  isWebsiteAvailable: boolean,
  oldWebsiteState: WebsiteState,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(isWebsiteAvailable, time);
  await editMessage(channelId, messageId, mainPayload);

  const duration = formatTimestamp(
    findDifference(oldWebsiteState.lastAvailabilityChangeTimestamp, time),
  );

  if (isWebsiteAvailable && !oldWebsiteState.hasReturned) {
    const updatePayload = buildWebsiteReturnPayload(duration, time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, `Website is finally back after ${duration}!`, traceId);
    return;
  }

  const updatePayload = isWebsiteAvailable
    ? buildWebsiteAvailablePayload(duration, time)
    : buildWebsiteUnavailablePayload(duration, time);
  await sendMessage(channelId, updatePayload);

  info(
    LOG_NAME,
    `Website ${isWebsiteAvailable ? "is back online" : "went down"} after ${duration}.`,
    traceId,
  );
}

function persistWebsiteStateUpdate(
  isWebsiteAvailable: boolean,
  oldWebsiteState: WebsiteState,
  time: Date,
): void {
  writeJsonFile(WEBSITE_STATE_PATH, {
    hasReturned: isWebsiteAvailable,
    isAvailable: oldWebsiteState.hasReturned ? true : isWebsiteAvailable,
    lastAvailabilityChangeTimestamp: time.toISOString(),
  });
}
