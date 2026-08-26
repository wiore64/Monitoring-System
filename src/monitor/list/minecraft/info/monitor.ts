import net from "node:net";

import config from "#data/minecraft/info/monitor-config.json" with { type: "json" };
import state from "#data/minecraft/info/monitor-state.json" with { type: "json" };
import { DnsError, translateNetworkError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";
import { isInDayOfWeekAndTimeRange } from "#utils/time.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "minecraft/info";
const MONITOR_STATE_PATH = "./data/minecraft/info/monitor-state.json";
const SERVER_INFO_PATH = "./data/minecraft/info/server-info.json";

const DEFAULT_SERVER_ICON =
  "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";
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

export type MonitorContext = {
  timeoutMs: number;
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
  const oldServerInfo = readJsonFile<ServerInfo>(SERVER_INFO_PATH);
  const fetchResult = await fetchServerInfo(context.timeoutMs);

  if (!fetchResult.success) {
    throw fetchResult.error;
  }

  if (state.messageId.length === 0) {
    await initializeMonitor(fetchResult.info, config["channel-id"], time, traceId);
    return context;
  }

  const comparisonResult = compareServerInfo(fetchResult.info, oldServerInfo);

  if (!comparisonResult.hasChanges) {
    return context;
  }

  await handleUpdate(
    fetchResult.info,
    comparisonResult.changedInfo,
    config["channel-id"],
    state.messageId,
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

      // Check errors
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
  serverInfo: ServerInfo,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(serverInfo, time);
  const message = await sendMessage(channelId, payload);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  writeJsonFile(SERVER_INFO_PATH, serverInfo);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareServerInfo(newServerInfo: ServerInfo, oldServerInfo: ServerInfo): ComparisonResult {
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
    if (["online"].includes(key)) {
      continue;
    }

    const updatePayload = buildUpdatePayload(key as keyof ServerInfo, oldValue, newValue, time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, `${key} updated. oldValue: ${oldValue} -> newValue: ${newValue}`, traceId);
  }

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
