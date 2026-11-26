import { EmbedBuilder } from "discord.js";

import config from "#data/other/trademarks/payload-config.json" with { type: "json" };
import { type Payload } from "#utils/message.js";
import { formatDate } from "#utils/time.js";

import { type TrademarkInfo } from "./monitor.js";

export function buildTrademarkUpdatePayload(trademarkName: string, info: TrademarkInfo): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.update.color))
    .setDescription(
      `🟡 **TRADEMARK UPDATE · ${trademarkName}**` +
        `\n\n**Status**` +
        `\n\`\`${info.status}\`\`` +
        `\n\n**Date**` +
        `\n\`\`${formatDate(info.date)}\`\``,
    )
    .setFooter({
      text: "Trademark Monitor",
    });

  return { embeds: [embed] };
}
