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
    );

  const motdEmbed = new EmbedBuilder()
    .setColor(Number(config.main.motd.color))
    .setTitle(config.main.motd.title)
    .setDescription(serverInfo.motd);

  const attachment = new AttachmentBuilder(Buffer.from(serverInfo.icon, "base64"), {
    name: "icon.png",
  });
  const iconEmbed = new EmbedBuilder()
    .setColor(Number(config.main.icon.color))
    .setTitle(config.main.icon.title)
    .setImage("attachment://icon.png");

  return {
    embeds: [generalEmbed, motdEmbed, iconEmbed],
    files: [attachment],
  };
}
export function buildUpdatePayload<K extends keyof ServerInfo>(
  key: K,
  newValue: ServerInfo[K],
  oldValue: ServerInfo[K],
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
    );

  const newValueEmbed = new EmbedBuilder()
    .setColor(Number(config.update.new.color))
    .setTitle(config.update.new.title);

  const oldValueEmbed = new EmbedBuilder()
    .setColor(Number(config.update.old.color))
    .setTitle(config.update.old.title);

  const payload: Payload = { embeds: [generalEmbed, newValueEmbed, oldValueEmbed] };

  if (key === "icon") {
    const newIcon = new AttachmentBuilder(Buffer.from(String(newValue), "base64"), {
      name: "new_icon.png",
    });
    newValueEmbed.setImage("attachment://new_icon.png");

    const oldIcon = new AttachmentBuilder(Buffer.from(String(oldValue), "base64"), {
      name: "old_icon.png",
    });
    oldValueEmbed.setImage("attachment://old_icon.png");

    payload.files = [newIcon, oldIcon];
  } else {
    newValueEmbed.setDescription(String(newValue));
    oldValueEmbed.setDescription(String(oldValue));
  }

  return payload;
}
