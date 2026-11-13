import { EmbedBuilder } from "discord.js";

import config from "#data/socials/youtube/payload-config.json" with { type: "json" };
import { formatContent, type Payload } from "#utils/message.js";

import { type ChannelInfo } from "./monitor.js";

export function buildMainPayload(channelInfo: ChannelInfo, timestamp: string): Payload {
  const first = new EmbedBuilder().setColor(Number(config.main.color)).setDescription(
    formatContent(config.main.general.body, {
      NAME: channelInfo.name,
      HANDLE: channelInfo.handle,
      VID_COUNT: channelInfo.videoCount,
      SUB_COUNT: channelInfo.subCount,
      VIEW_COUNT: channelInfo.viewCount,
      TIMESTAMP: timestamp,
    }),
  );

  const second = new EmbedBuilder()
    .setColor(Number(config.main.color))
    .setTitle(config.main.description.title)
    .setDescription(channelInfo.description);

  const third = new EmbedBuilder()
    .setColor(Number(config.main.color))
    .setTitle(config.main.avatar.title)
    .setImage(channelInfo.avatar);

  const fourth = new EmbedBuilder()
    .setColor(Number(config.main.color))
    .setTitle(config.main.banner.title)
    .setImage(channelInfo.banner);

  return { embeds: [first, second, third, fourth] };
}

export function buildUpdatePayload<K extends keyof ChannelInfo>(
  key: K,
  newValue: ChannelInfo[K],
  oldValue: ChannelInfo[K],
  time: Date,
): Payload {
  const labels: Record<keyof ChannelInfo, string> = {
    name: "Channel Name",
    handle: "Handle",
    subCount: "Subscribers",
    viewCount: "Total Views",
    videoCount: "Videos",
    description: "Description",
    avatar: "Avatar",
    banner: "Banner",
  };

  const format = (val: unknown) =>
    val === null || val === undefined || String(val).trim() === "" ? "*None*" : String(val);

  const truncate = (text: string, max = 1000) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;

  const quote = (text: string) =>
    truncate(
      text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
      1020,
    );

  const label = labels[key] ?? String(key);
  const timestampLine = `-# Observed on \`${time.toUTCString()}\``;

  const embed = new EmbedBuilder()
    .setColor(Number(config.update.color))
    .setFooter({ text: "YouTube Monitor" });

  if (key === "avatar" || key === "banner") {
    const oldUrl = oldValue ? String(oldValue) : null;
    const newUrl = newValue ? String(newValue) : null;

    if (oldUrl && newUrl) {
      const galleryUrl = "https://youtube.com";

      embed
        .setURL(galleryUrl)
        .setDescription(`### Update Observed · ${label}\n${timestampLine}`)
        .addFields(
          { name: "Old", value: oldUrl ? "*(See image)*" : "*None*", inline: true },
          { name: "New", value: newUrl ? "*(See image)*" : "*None*", inline: true },
        )
        .setImage(oldUrl);

      const second = new EmbedBuilder().setURL(galleryUrl).setImage(newUrl);
      return { embeds: [embed, second] };
    }

    embed
      .setTitle(`Update Observed · ${label}`)
      .setDescription(timestampLine)
      .addFields(
        { name: "Old", value: oldUrl ? "*(See image)*" : "*None*", inline: true },
        { name: "New", value: newUrl ? "*(See image)*" : "*None*", inline: true },
      );

    if (oldUrl || newUrl) {
      embed.setImage((newUrl ?? oldUrl)!);
    }

    return { embeds: [embed] };
  }

  embed.setTitle(`Update Observed · ${label}`).setDescription(timestampLine);

  if (key === "description") {
    embed.addFields(
      { name: "Old Value", value: quote(format(oldValue)), inline: false },
      { name: "New Value", value: quote(format(newValue)), inline: false },
    );
  } else {
    embed.addFields(
      { name: "Old Value", value: `\`${truncate(format(oldValue), 256)}\``, inline: true },
      { name: "New Value", value: `\`${truncate(format(newValue), 256)}\``, inline: true },
    );
  }

  return { embeds: [embed] };
}
