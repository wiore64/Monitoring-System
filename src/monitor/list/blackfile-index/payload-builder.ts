import { type Payload, formatContent } from "#utils/message.js";
import { readJsonFile } from "#utils/file.js";
import { EmbedBuilder } from "discord.js";

const PAYLOAD_CONFIG_PATH = "./data/blackfile-index/payload-config.json";

type PayloadConfig = {
  main: MainPayloadConfig;
  websiteUp: WebsiteUpPayloadConfig;
  websiteDown: WebsiteDownPayloadConfig;
};

type MainPayloadConfig = {
  color: string;
  descriptionUp: string;
  descriptionDown: string;
};

type WebsiteUpPayloadConfig = {
  color: string;
  title: string;
  description: string;
};

type WebsiteDownPayloadConfig = {
  color: string;
  title: string;
  description: string;
};

export function buildMainPayload(isWebsiteOnline: boolean, time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).main;

  const embed = new EmbedBuilder()
    .setColor(Number(config.color))
    .setDescription(
      isWebsiteOnline
        ? formatContent(config.descriptionUp, {
            TIMESTAMP: time.toUTCString(),
          })
        : formatContent(config.descriptionDown, {
            TIMESTAMP: time.toUTCString(),
          }),
    )
    .setTimestamp(time);

  return { embeds: [embed] };
}

export function buildWebsiteUpPayload(time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).websiteUp;

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

export function buildWebsiteDownPayload(time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).websiteDown;

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
