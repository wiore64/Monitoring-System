import { EmbedBuilder } from "discord.js";

import config from "#data/filianislost/payload-config.json" with { type: "json" };
import { formatContent, type Payload } from "#utils/message.js";

export function buildMainPayload(timestamp: string): Payload {
  const embed = new EmbedBuilder().setColor(Number(config.main.color)).setDescription(
    formatContent(config.main.description, {
      TIMESTAMP: timestamp,
    }),
  );

  return { embeds: [embed] };
}

export function buildUpdatePayload(time: Date): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.update.color))
    .setTitle(config.update.title)
    .setDescription(
      formatContent(config.update.description, {
        TIMESTAMP: time.toUTCString(),
      }),
    );

  return { embeds: [embed] };
}
