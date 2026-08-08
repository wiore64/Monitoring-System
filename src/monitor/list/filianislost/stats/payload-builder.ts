import { EmbedBuilder } from "discord.js";

import { readJsonFile } from "#utils/file.js";
import { formatContent, type Payload } from "#utils/message.js";

import { type SignalStats } from "./monitor.js";

const PAYLOAD_CONFIG_PATH = "./data/filianislost/stats/payload-config.json";

type PayloadConfig = {
  main: PayloadMainConfig;
  update: PayloadUpdateConfig;
};

type PayloadMainConfig = {
  color: string;
  description: string;
};

type PayloadUpdateConfig = {
  color: string;
  title: string;
  description: string;
};

export function buildMainPayload(stats: SignalStats, time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).main;

  const embed = new EmbedBuilder()
    .setColor(Number(config.color))
    .setDescription(
      formatContent(config.description, {
        PAINTERS: stats.userCount,
        SIGNALS: stats.signalCount,
        APPROVED_SIGNALS: stats.approvedSignalCount,
        time: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  return { embeds: [embed] };
}

export function buildUpdatePayload(time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).update;

  const embed = new EmbedBuilder()
    .setColor(Number(config.color))
    .setTitle(config.title)
    .setDescription(
      formatContent(config.description, {
        time: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  return { embeds: [embed] };
}
