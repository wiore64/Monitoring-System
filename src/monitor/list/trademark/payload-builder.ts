import { readJsonFile } from "#utils/file.js";
import { formatContent, type Payload } from "#utils/message.js";
import { EmbedBuilder } from "discord.js";

import { type TrademarkInfo } from "./monitor.js";

const PAYLOAD_CONFIG = "./data/trademark/payload-config.json";

type PayloadConfig = {
  color: string;
  title: string;
  description: string;
};

export function buildUpdatePayload(trademarkInfo: TrademarkInfo, time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG);

  const embed = new EmbedBuilder()
    .setColor(Number(config.color))
    .setTitle(config.title)
    .setDescription(
      formatContent(config.description, {
        STATUS: trademarkInfo.status,
        DESCRIPTION: trademarkInfo.description,
        DATE: trademarkInfo.date,
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  return { embeds: [embed] };
}
