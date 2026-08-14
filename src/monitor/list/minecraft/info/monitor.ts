import net from "node:net";

import config from "#data/minecraft/info/monitor-config.json" with { type: "json" };
import { DnsError, translateNetworkError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";
import { isInDayOfWeekAndTimeRange } from "../time.js";

const LOG_NAME = "minecraft/info";
const MONITOR_STATE_PATH = "./data/minecraft/info/monitor-state.json";
const SERVER_INFO_PATH = "./data/minecraft/info/server-info.json";

const DEFAULT_SERVER_ICON = "";
const OFFLINE_SERVER_DATA = {
  motd: "Can't connect to server.",
  iconBase64: DEFAULT_SERVER_ICON,
  version: "N/A",
  protocol: -1,
  maxOnline: 0,
  online: 0,
};

export const schedulerHooks = {
  isNearRestartWindow: (now: Date): boolean => {
    return isInDayOfWeekAndTimeRange(
      config["restart-window"].near.start,
      config["restart-window"].near.end,
      now,
    );
  },
};

type MonitorState = {
  "message-id": string;
};

export type MonitorContext = {
  "timeout-ms": number;
};

export type ServerInfo = {
  motd: string;
  iconBase64: string;
  version: string;
  protocol: number;
  maxOnline: number;
  online: number;
};

type ChangedServerInfo = Partial<{
  [T in keyof ServerInfo]: {
    oldValue: ServerInfo[T];
    newValue: ServerInfo[T];
  };
}>;

type FetchResult =
  { success: true; isUnavailable: boolean; info: ServerInfo } | { success: false; error: Error };

type ComparisonResult = {
  hasChanges: boolean;
  changedInfo: ChangedServerInfo;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const oldServerInfo = readJsonFile<ServerInfo>(SERVER_INFO_PATH);
  const fetchResult = await fetchServerInfo(context["timeout-ms"]);

  if (!fetchResult.success) {
    throw fetchResult.error;
  }

  if (state["message-id"].length === 0) {
    await initializeMonitor(state, fetchResult.info, config["channel-id"], time, traceId);
    return context;
  }

  const comparisonResult = compareServerInfo(oldServerInfo, fetchResult.info);

  if (!comparisonResult.hasChanges) {
    return context;
  }

  await handleUpdate(
    fetchResult.info,
    comparisonResult.changedInfo,
    config["channel-id"],
    state["message-id"],
    time,
    traceId,
  );

  return context;
}

async function fetchServerInfo(timeoutMs: number): Promise<FetchResult> {
  return new Promise((res) => {
    const socket = net.createConnection({
      host: "50.115.0.25",
      port: 25565,
    });

    socket.setNoDelay(true);
    socket.setTimeout(timeoutMs);

    let buffer = Buffer.alloc(0);
    let offset = 0;

    socket.once("connect", () => {
      const handshakePayload = Buffer.concat([
        encodeVarInt(0x00),
        encodeVarInt(774),
        encodeString("50.115.0.25"),
        encodeUnsignedShort(25565),
        encodeVarInt(1),
      ]);
      socket.write(Buffer.concat([encodeVarInt(handshakePayload.length), handshakePayload]));

      const statusPayload = Buffer.concat([encodeVarInt(0x00)]);
      socket.write(Buffer.concat([encodeVarInt(statusPayload.length), statusPayload]));
    });

    socket.on("data", (payload: Buffer) => {
      buffer = Buffer.concat([buffer, payload]);

      if (!isPacketComplete(buffer, 0)) {
        return;
      }

      const packetLengthInfo = decodeVarInt(buffer, offset);
      offset = packetLengthInfo.offset;

      const packetId = decodeVarInt(buffer, offset);
      offset = packetId.offset;

      const stringLength = decodeVarInt(buffer, offset);
      offset = stringLength.offset;

      const textInfo = decodeString(buffer, offset, offset + stringLength.value);
      const jsonInfo = JSON.parse(textInfo);

      socket.destroy();
      res({
        success: true,
        isUnavailable: false,
        info: {
          motd: jsonInfo.description,
          iconBase64: jsonInfo.favicon?.slice(",")[1] ?? DEFAULT_SERVER_ICON,
          version: jsonInfo.version.name,
          protocol: jsonInfo.version.protocol,
          online: jsonInfo.players.online,
          maxOnline: jsonInfo.players.max,
        },
      });
    });

    socket.once("timeout", () => {
      socket.destroy();

      res({
        success: true,
        isUnavailable: true,
        info: OFFLINE_SERVER_DATA,
      });
    });

    socket.once("error", (error: Error) => {
      socket.destroy();

      const networkError = translateNetworkError(error);

      if (networkError instanceof DnsError) {
        res({
          success: false,
          error: networkError,
        });
        return;
      }

      res({
        success: true,
        isUnavailable: true,
        info: OFFLINE_SERVER_DATA,
      });
    });
  });
}

async function initializeMonitor(
  state: MonitorState,
  serverInfo: ServerInfo,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(serverInfo, time);
  const message = await sendMessage(channelId, payload);

  state["message-id"] = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  updateServerInfo(serverInfo);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareServerInfo(oldServerInfo: ServerInfo, newServerInfo: ServerInfo): ComparisonResult {
  const changedInfo: ChangedServerInfo = {};

  for (const key of Object.keys(newServerInfo) as (keyof ServerInfo)[]) {
    const oldValue = oldServerInfo[key];
    const newValue = newServerInfo[key];

    if (oldValue === newValue) {
      continue;
    }

    // Tried my best to suppress it because it is obvious what it complains about is impossible.
    (changedInfo as Record<keyof ServerInfo, ChangedServerInfo>)[key] = {
      oldValue,
      newValue,
    } as ChangedServerInfo;
  }

  return {
    hasChanges: Object.keys(changedInfo).length > 0,
    changedInfo,
  };
}

async function handleUpdate(
  serverInfo: ServerInfo,
  changedServerInfo: ChangedServerInfo,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const mainPayload = buildMainPayload(serverInfo, time);
  await editMessage(channelId, messageId, mainPayload);

  for (const [key, { oldValue, newValue }] of Object.entries(changedServerInfo)) {
    const updatePayload = buildUpdatePayload(key as keyof ServerInfo, oldValue, newValue, time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, `${key} updated. oldValue: ${oldValue} -> newValue: ${newValue}`, traceId);
  }

  updateServerInfo(serverInfo);
}

function updateServerInfo(serverInfo: ServerInfo) {
  writeJsonFile(SERVER_INFO_PATH, serverInfo);
}

function encodeVarInt(value: number): Buffer {
  const out = [];

  while (true) {
    if ((value & 0x80) === 0) {
      out.push(value);
      break;
    }

    out.push((value & 0x7f) | 0x80);

    value >>>= 7;
  }

  return Buffer.from(out);
}

function encodeUnsignedShort(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUint16BE(value, 0);
  return out;
}

function encodeString(value: string): Buffer {
  return Buffer.concat([encodeVarInt(value.length), Buffer.from(value, "utf8")]);
}

function decodeVarInt(buffer: Buffer, offset: number): { value: number; offset: number } {
  let value = 0;
  let position = 0;

  while (true) {
    if (offset >= buffer.length) {
      return { value: NaN, offset: 0 };
    }

    const byte = buffer[offset++];
    if (byte === undefined) {
      return { value: NaN, offset: 0 };
    }

    value |= (byte & 0x7f) << position;

    if ((byte & 0x80) === 0) {
      break;
    }

    position += 7;

    if (position > 32) {
      throw new TypeError("VarInt is too big.");
    }
  }

  return { value, offset };
}

function decodeString(value: Buffer, start: number, end: number): string {
  return value.toString("utf8", start, end);
}

function isPacketComplete(buffer: Buffer, offset: number): boolean {
  const packetLengthInfo = decodeVarInt(buffer, offset);

  if (Number.isNaN(packetLengthInfo.value)) {
    return false;
  }

  const packetSize = packetLengthInfo.offset + packetLengthInfo.value;

  return buffer.length >= packetSize;
}
