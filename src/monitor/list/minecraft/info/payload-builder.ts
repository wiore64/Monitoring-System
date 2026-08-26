import { AttachmentBuilder, EmbedBuilder } from "discord.js";

import config from "#data/minecraft/info/payload-config.json" with { type: "json" };
import { formatContent, type Payload } from "#utils/message.js";

import { type ServerInfo } from "./monitor.js";

export function buildMainPayload(serverInfo: ServerInfo, time: Date): Payload {
  const generalEmbed = new EmbedBuilder()
    .setColor(Number(config.main.general.color))
    .setDescription(
      formatContent(config.main.general.description, {
        VERSION: serverInfo.version,
        PROTOCOL: serverInfo.protocol,
        ONLINE: serverInfo.online,
        MAX_ONLINE: serverInfo.maxOnline,
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  const motdEmbed = new EmbedBuilder()
    .setColor(Number(config.main.motd.color))
    .setTitle(config.main.motd.title)
    .setDescription(serverInfo.motd)
    .setTimestamp(time);

  const attachment = new AttachmentBuilder(Buffer.from(serverInfo.iconBase64, "base64"), {
    name: "icon.png",
  });
  const iconEmbed = new EmbedBuilder()
    .setColor(Number(config.main.icon.color))
    .setTitle(config.main.icon.title)
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
  const generalEmbed = new EmbedBuilder()
    .setColor(Number(config.update.general.color))
    .setTitle(config.update.general.title)
    .setDescription(
      formatContent(config.update.general.description, {
        TARGET: key,
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  const newVersionEmbed = new EmbedBuilder()
    .setColor(Number(config.update.new.color))
    .setTitle(config.update.new.title)
    .setTimestamp(time);

  const oldVersionEmbed = new EmbedBuilder()
    .setColor(Number(config.update.old.color))
    .setTitle(config.update.old.title)
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
