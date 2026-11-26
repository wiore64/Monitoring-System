import { EmbedBuilder } from "discord.js";

import config from "#data/blackfile-index/payload-config.json" with { type: "json" };
import { formatContent, type Payload } from "#utils/message.js";

export function buildMainPayload(isWebsiteAvailable: boolean, timestamp: string): Payload {
  const embed = new EmbedBuilder().setColor(Number(config.main.color)).setDescription(
    formatContent(config.main.description, {
      STATUS: isWebsiteAvailable ? "Available" : "Unavailable",
      TIMESTAMP: timestamp,
    }),
  );

  return { embeds: [embed] };
}

export function buildWebsiteAvailablePayload(time: Date): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.update.available.color))
    .setTitle(config.update.available.title)
    .setDescription(
      formatContent(config.update.available.description, {
        TIMESTAMP: time.toUTCString(),
      }),
    );

  return { embeds: [embed] };
}

export function buildWebsiteUnavailablePayload(time: Date): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.update.unavailable.color))
    .setTitle(config.update.unavailable.title)
    .setDescription(
      formatContent(config.update.unavailable.description, {
        TIMESTAMP: time.toUTCString(),
      }),
    );

  return { embeds: [embed] };
}
