import { DnsError, HttpError, TimeoutError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";

import {
  buildMainPayload,
  buildWebsiteUpPayload,
  buildWebsiteDownPayload,
} from "./payload-builder.js";

const LOG_NAME = "blackfile-index";
const MONITOR_CONFIG_PATH = "./data/blackfile-index/monitor-config.json";
const MONITOR_STATE_PATH = "./data/blackfile-index/monitor-state.json";

type MonitorConfig = {
  "channel-id": string;
};

type MonitorState = {
  "message-id": string;
  "is-website-online": boolean;
};

export type MonitorContext = {
  "timeout-ms": number;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const config = readJsonFile<MonitorConfig>(MONITOR_CONFIG_PATH);
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const isWebsiteOnline = await checkWebsiteStatus(context["timeout-ms"]);

  if (state["message-id"].length === 0) {
    await initializeMonitor(state, isWebsiteOnline, config["channel-id"], time, traceId);
    return context;
  }

  if (isWebsiteOnline === state["is-website-online"]) {
    return context;
  }

  await handleUpdate(
    isWebsiteOnline,
    state,
    config["channel-id"],
    state["message-id"],
    time,
    traceId,
  );

  return context;
}

async function initializeMonitor(
  state: MonitorState,
  isWebsiteOnline: boolean,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(isWebsiteOnline, time);
  const message = await sendMessage(channelId, payload);

  state["message-id"] = message.id;
  state["is-website-online"] = isWebsiteOnline;

  writeJsonFile(MONITOR_STATE_PATH, state);

  info(LOG_NAME, "Initialized.", traceId);
}

async function checkWebsiteStatus(timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch("https://blackfile-index.org", {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch (thing: unknown) {
    if (!(thing instanceof Error)) {
      throw new TypeError(`Non-error thrown: ${thing}`, { cause: thing });
    }

    if (thing instanceof HttpError || thing instanceof TimeoutError || thing instanceof DnsError) {
      return false;
    }

    throw thing;
  }
}

async function handleUpdate(
  isWebsiteOnline: boolean,
  state: MonitorState,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(isWebsiteOnline, time);
  await editMessage(channelId, messageId, mainPayload);

  const updatePayload = isWebsiteOnline
    ? buildWebsiteUpPayload(time)
    : buildWebsiteDownPayload(time);
  await sendMessage(channelId, updatePayload);

  state["is-website-online"] = isWebsiteOnline;
  writeJsonFile(MONITOR_STATE_PATH, state);

  info(LOG_NAME, `Website went ${isWebsiteOnline ? "up" : "down"}.`, traceId);
}
