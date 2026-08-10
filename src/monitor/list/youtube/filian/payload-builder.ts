import { EmbedBuilder } from "discord.js";

import { readJsonFile } from "#utils/file.js";
import { formatContent, type Payload } from "#utils/message.js";

import { type ChannelInfo } from "./monitor.js";

const PAYLOAD_CONFIG_PATH = "./data/youtube/filian/payload-config.json";

type PayloadConfig = {
  main: {
    general: {
      color: string;
      description: string;
    };
    description: {
      color: string;
      title: string;
    };
    avatar: {
      color: string;
      title: string;
    };
    banner: {
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

export function buildMainPayload(channelInfo: ChannelInfo, time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).main;

  const generalEmbed = new EmbedBuilder()
    .setColor(Number(config.general.color))
    .setDescription(
      formatContent(config.general.description, {
        NAME: channelInfo.name,
        HANDLE: channelInfo.handle,
        SUB_COUNT: channelInfo.subCount,
        VIEW_COUNT: channelInfo.viewCount,
        VID_COUNT: channelInfo.videoCount,
        TIMESTAMP: time.toUTCString(),
      }),
    )
    .setTimestamp(time);

  const descriptionEmbed = new EmbedBuilder()
    .setColor(Number(config.description.color))
    .setTitle(config.description.title)
    .setDescription(channelInfo.description)
    .setTimestamp(time);

  const avatarEmbed = new EmbedBuilder()
    .setColor(Number(config.avatar.color))
    .setTitle(config.avatar.title)
    .setImage(channelInfo.avatar)
    .setTimestamp(time);

  const bannerEmbed = new EmbedBuilder()
    .setColor(Number(config.banner.color))
    .setTitle(config.banner.title)
    .setImage(channelInfo.banner)
    .setTimestamp(time);

  return { embeds: [generalEmbed, descriptionEmbed, avatarEmbed, bannerEmbed] };
}

export function buildUpdatePayload<K extends keyof ChannelInfo>(
  field: K,
  oldValue: ChannelInfo[K],
  newValue: ChannelInfo[K],
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

  if (field === "avatar" || field === "banner") {
    if (newValue) {
      newVersionEmbed.setImage(String(newValue));
    }

    if (oldValue) {
      oldVersionEmbed.setImage(String(oldValue));
    }
  } else {
    newVersionEmbed.setDescription(String(newValue));
    oldVersionEmbed.setDescription(String(oldValue));
  }

  return { embeds: [generalEmbed, newVersionEmbed, oldVersionEmbed] };
}
