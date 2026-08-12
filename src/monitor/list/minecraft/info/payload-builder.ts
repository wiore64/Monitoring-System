import { AttachmentBuilder, EmbedBuilder } from "discord.js";

import { readJsonFile } from "#utils/file.js";
import { formatContent, type Payload } from "#utils/message.js";

import { type ServerInfo } from "./monitor.js";

const PAYLOAD_CONFIG_PATH = "./data/minecraft/info/payload-config.json";

type PayloadConfig = {
  main: {
    general: {
      color: string;
      description: string;
    };
    motd: {
      color: string;
      title: string;
    };
    icon: {
      color: string;
      title: string;
    };
  };
  update: {
    general: {
      color: string;
      title: string;
      description: string;
    };
    new: {
      color: string;
      title: string;
    };
    old: {
      color: string;
      title: string;
    };
  };
};

export function buildMainPayload(serverInfo: ServerInfo, time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).main;

  const generalEmbed = new EmbedBuilder()
    .setColor(Number(config.general.color))
    .setDescription(
      formatContent(config.general.description, {
        VERSION: serverInfo.version,
        PROTOCOL: serverInfo.protocol,
        ONLINE: serverInfo.online,
        MAX_ONLINE: serverInfo.maxOnline,
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  const motdEmbed = new EmbedBuilder()
    .setColor(Number(config.motd.color))
    .setTitle(config.motd.title)
    .setDescription(serverInfo.motd)
    .setTimestamp(time);

  const attachment = new AttachmentBuilder(Buffer.from(serverInfo.iconBase64, "base64"), {
    name: "icon.png",
  });
  const iconEmbed = new EmbedBuilder()
    .setColor(Number(config.icon.color))
    .setTitle(config.icon.title)
    .setImage("attachment://icon.png")
    .setTimestamp(time);

  return {
    embeds: [generalEmbed, motdEmbed, iconEmbed],
    files: [attachment],
  };
}
export function buildUpdatePayload<K extends keyof ServerInfo>(
  key: K,
  oldValue: ServerInfo[K],
  newValue: ServerInfo[K],
  time: Date,
): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).update;

  const generalEmbed = new EmbedBuilder()
    .setColor(Number(config.general.color))
    .setTitle(config.general.title)
    .setDescription(
      formatContent(config.general.description, {
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  const newVersionEmbed = new EmbedBuilder()
    .setColor(Number(config.new.color))
    .setTitle(config.new.title)
    .setTimestamp(time);

  const oldVersionEmbed = new EmbedBuilder()
    .setColor(Number(config.old.color))
    .setTitle(config.old.title)
    .setTimestamp(time);

  const payload: Payload = { embeds: [generalEmbed, newVersionEmbed, oldVersionEmbed] };

  if (key === "iconBase64") {
    const newIcon = new AttachmentBuilder(Buffer.from(String(newValue), "base64"), {
      name: "new_icon.png",
    });
    newVersionEmbed.setImage("attachment://new_icon.png");

    const oldIcon = new AttachmentBuilder(Buffer.from(String(oldValue), "base64"), {
      name: "old_icon.png",
    });
    oldVersionEmbed.setImage("attachment://old_icon.png");

    payload.files = [newIcon, oldIcon];
  } else {
    newVersionEmbed.setDescription(String(newValue));
    oldVersionEmbed.setDescription(String(oldValue));
  }

  return payload;
}
