import { EmbedBuilder } from "discord.js";

import config from "#data/other/trademarks/payload-config.json" with { type: "json" };
import { formatContent, type Payload } from "#utils/message.js";

import { type TrademarkInfo, type TrademarkType } from "./monitor.js";

export function buildUpdatePayload(
  trademarkName: TrademarkType,
  trademarkInfo: TrademarkInfo,
  time: Date,
): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.update.color))
    .setTitle(config.update.title)
    .setDescription(
      formatContent(config.update.description, {
        NAME: trademarkName,
        STATUS: trademarkInfo.status,
        DESCRIPTION: trademarkInfo.description,
        DATE: trademarkInfo.date,
      }),
    )
    .setTimestamp(time);

  return { embeds: [embed] };
}
