import { EmbedBuilder } from "discord.js";

import config from "#data/minecraft/state/payload-config.json" with { type: "json" };
import { type Payload, formatContent } from "#utils/message.js";

import type { ServerState, ServerStatus } from "./monitor.js";

export function buildMainPayload(state: ServerState, timestamp: string): Payload {
  const embed = new EmbedBuilder().setColor(Number(config.status.color)).setDescription(
    formatContent(config.main.body, {
      STATUS: config.other["status-names"][state.status],
      TIMESTAMP: timestamp,
    }),
  );

  return { embeds: [embed] };
}

export function buildStatusPayload(status: ServerStatus, time: Date): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.status.color))
    .setTitle("Status Update")
    .addFields(
      { name: "Status", value: `\`${config.other["status-names"][status]}\``, inline: true },
      { name: "Reported", value: `\`${time.toUTCString()}\``, inline: true },
    )
    .setFooter({ text: "Minecraft State Monitor" });

  return { embeds: [embed] };
}

export function buildEventPayload(): Payload {
  return {};
}
