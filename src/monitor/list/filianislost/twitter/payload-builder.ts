import { EmbedBuilder } from "discord.js";

import { readJsonFile } from "#utils/file.js";
import { formatContent, type Payload } from "#utils/message.js";

const PAYLOAD_CONFIG_PATH = "./data/twitter/wall/payload-config.json";

type PayloadConfig = {
  color: string;
  title: string;
  description: string;
};

export function buildUpdatePayload(time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH);

  const embed = new EmbedBuilder()
    .setColor(Number(config.color))
    .setTitle(config.title)
    .setDescription(
      formatContent(config.description, {
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  return { embeds: [embed] };
}
