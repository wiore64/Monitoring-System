import { EmbedBuilder } from "discord.js";

import config from "#data/filianislost/website/stats/payload-config.json" with { type: "json" };
import { formatContent, type Payload } from "#utils/message.js";

import { type SignalInfo, type SignalStats } from "./monitor.js";

export function buildMainPayload(stats: SignalStats, time: Date): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.main.color))
    .setDescription(
      formatContent(config.main.description, {
        PAINTERS: stats.userCount,
        SIGNALS: stats.signalCount,
        APPROVED_SIGNALS: stats.approvedSignalCount,
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  return { embeds: [embed] };
}

export function buildUpdatePayload(count: number, time: Date): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.update.color))
    .setTitle(config.update.title)
    .setDescription(
      formatContent(config.update.description, {
        COUNT: count,
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  return { embeds: [embed] };
}

export function buildSignalPayload(signal: SignalInfo, time: Date): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.signal.color))
    .setTitle(config.signal.title)
    .setDescription(
      formatContent(config.signal.description, {
        ID: signal.num_id,
        NAME: signal.name,
        LOCATION: signal.location,
        SUBMITTED_AT: new Date(Number(signal.submitted_at)).toUTCString(),
        APPROVED_AT: time.toUTCString(),
      }),
    )
    .setImage(signal.image_file)
    .setTimestamp(time);

  return { embeds: [embed] };
}
