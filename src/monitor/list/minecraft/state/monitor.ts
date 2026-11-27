import net from "node:net";

import config from "#data/minecraft/state/monitor-config.json" with { type: "json" };
import monitorState from "#data/minecraft/state/monitor-state.json" with { type: "json" };
import { classifyNetworkError, isDnsError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { debug, info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";
import { isInTimeRange } from "#utils/time.js";

import { buildMainPayload, buildStatusPayload } from "./payload-builder.js";

const LOG_NAME = "monitors/minecraft/state";
const MONITOR_STATE_PATH = "./data/minecraft/state/monitor-state.json";
const SERVER_STATE_PATH = "./data/minecraft/state/server-state.json";

export const schedulerHooks = {
  isRestartTime: (now: Date): boolean => {
    return isInTimeRange(config.events.restart.start, config.events.restart.end, now);
  },
};

export type MonitorContext = {
  noResponseCount: number;
  timeoutMs: number;
};

export type ServerStatus = "ONLINE" | "OFFLINE" | "RESPONDING" | "UNRESPONDING";

export type ServerState = {
  status: ServerStatus;
};

type UpdatedServerState = {
  status?: ServerStatus;
};

type ComparisonResult = { hasUpdates: true; state: UpdatedServerState } | { hasUpdates: false };

export async function run(
  ctx: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldState = readJsonFile<ServerState>(SERVER_STATE_PATH);
  const isResponding = await fetchServerResponse(ctx.timeoutMs);

  const newState = inferServerState(isResponding, oldState, ctx);

  if (monitorState.messageId.length === 0) {
    await initializeMonitor(newState, config["channel-id"], traceId);
    return ctx;
  }

  if (Object.keys(oldState).length === 0) {
    writeJsonFile(SERVER_STATE_PATH, newState);
    debug(LOG_NAME, "Old state not found. A new one persisted.", traceId);
    return ctx;
  }

  const comparisonResult = compareServerStates(oldState, newState);

  if (!comparisonResult.hasUpdates) {
    return ctx;
  }

  await reportUpdate(
    newState,
    comparisonResult.state,
    config["channel-id"],
    monitorState.messageId,
    time,
    traceId,
  );
  writeJsonFile(SERVER_STATE_PATH, newState);

  return ctx;
}

async function fetchServerResponse(timeoutMs: number): Promise<boolean> {
  return new Promise((res, rej) => {
    const socket = net.createConnection({
      host: "50.115.0.25",
      port: 25565,
    });

    socket.setNoDelay(true);
    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      socket.end();
      res(true);
    });

    socket.once("timeout", () => {
      socket.end();
      res(false);
    });

    socket.once("error", (e: Error) => {
      socket.destroy();

      const networkError = classifyNetworkError(e);

      if (isDnsError(networkError)) {
        rej(networkError);
        return;
      }

      res(false);
    });
  });
}

async function initializeMonitor(
  state: ServerState,
  channelId: string,
  traceId: string,
): Promise<void> {
  const message = await sendMessage(channelId, buildMainPayload(state, "N/A"));

  writeJsonFile(SERVER_STATE_PATH, state);

  monitorState.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, monitorState);

  debug(LOG_NAME, "Initialized.", traceId);
}

function inferServerState(
  isServerResponding: boolean,
  oldServerState: ServerState,
  ctx: MonitorContext,
): ServerState {
  return {
    status: determineServerStatus(isServerResponding, oldServerState, ctx),
  };
}

function determineServerStatus(
  isServerResponding: boolean,
  oldServerState: ServerState,
  ctx: MonitorContext,
): ServerStatus {
  if (isServerResponding) {
    ctx.noResponseCount = 0;

    if (
      oldServerState.status === "ONLINE" ||
      oldServerState.status === "RESPONDING" ||
      oldServerState.status === "OFFLINE"
    ) {
      return "ONLINE";
    }

    return "RESPONDING";
  } else {
    if (oldServerState.status === "OFFLINE") {
      return "OFFLINE";
    }

    if (
      oldServerState.status === "ONLINE" ||
      oldServerState.status === "RESPONDING" ||
      ctx.noResponseCount < config.status["no-response-threshold"]
    ) {
      ctx.noResponseCount++;
      return "UNRESPONDING";
    }

    ctx.noResponseCount = 0;
    return "OFFLINE";
  }
}

function compareServerStates(oldState: ServerState, newState: ServerState): ComparisonResult {
  const updatedState: UpdatedServerState = {};

  if (newState.status !== oldState.status) {
    updatedState.status = newState.status;
  }

  return { hasUpdates: Object.keys(updatedState).length > 0, state: updatedState };
}

async function reportUpdate(
  state: ServerState,
  updatedState: UpdatedServerState,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  await editMessage(channelId, messageId, buildMainPayload(state, time.toUTCString()));

  if (updatedState.status != null) {
    await sendMessage(channelId, buildStatusPayload(updatedState.status, time));
    info(LOG_NAME, `Server status updated to ${updatedState.status}.`, traceId);
  }
}
