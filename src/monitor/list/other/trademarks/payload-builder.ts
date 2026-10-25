import { EmbedBuilder } from "discord.js";

import config from "#data/other/trademarks/payload-config.json" with { type: "json" };
import { formatContent, type Payload } from "#utils/message.js";

import { type TrademarkInfo } from "./monitor.js";

export function buildUpdatePayload(trademarkName: string, trademarkInfo: TrademarkInfo): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.update.color))
    .setTitle(config.update.title)
    .setDescription(
      formatContent(config.update.description, {
        NAME: trademarkName,
        STATUS: trademarkInfo.status,
        DATE: trademarkInfo.date,
      }),
    );

  return { embeds: [embed] };
}
