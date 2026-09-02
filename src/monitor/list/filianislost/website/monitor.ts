import config from "#data/filianislost/website/monitor-config.json" with { type: "json" };
import state from "#data/filianislost/website/monitor-state.json" with { type: "json" };
import { DnsError, translateNetworkError } from "#shared/error.js";
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

const LOG_NAME = "filianislost/website";
const MONITOR_STATE_PATH = "./data/filianislost/website/monitor-state.json";
const WEBSITE_STATE_PATH = "./data/filianislost/website/website-state.json";

const WEBSITE_LINK = "https://filianislost.com/";
const INITIAL_LAST_AVAILABILITY_CHANGE_TIME = new Date("2026-08-27T10:54:00Z");

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
  try {
    const response = await fetch(WEBSITE_LINK, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch (thing: unknown) {
    if (!(thing instanceof Error)) {
      throw new TypeError(`Non-error thrown: ${thing}`, { cause: thing });
    }

    const networkError = translateNetworkError(thing);

    if (networkError instanceof DnsError) {
      throw networkError;
    }

    return false;
  }
}

async function initializeMonitor(
  isWebsiteAvailable: boolean,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(isWebsiteAvailable, INITIAL_LAST_AVAILABILITY_CHANGE_TIME);
  const message = await sendMessage(channelId, payload);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  persistWebsiteStateUpdate(isWebsiteAvailable, isWebsiteAvailable, time);

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
  const mainPayload = buildMainPayload(isWebsiteAvailable, time);
  await editMessage(channelId, messageId, mainPayload);

  const duration = formatTimestamp(
    findDifference(oldWebsiteState.lastAvailabilityChangeTimestamp, time),
  );

  if (isWebsiteAvailable && !oldWebsiteState.hasEverReturned) {
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
