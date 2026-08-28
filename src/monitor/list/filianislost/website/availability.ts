import { EmbedBuilder } from "discord.js";

import config from "#data/filianislost/website/availability-config.json" with { type: "json" };
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { formatContent, sendMessage } from "#utils/message.js";
import { findDifference, formatTimestamp } from "#utils/time.js";

const STATE_NAME = "filianislost@availability";
const AVAILABILITY_STATE = "./data/filianislost/website/availability-state.json";
let noResponseCount: number = 0;
let responseCount: number = 0;

type AvailabilityState = {
  isAvailable: boolean;
  lastChange: string;
};

export async function updateAvailabilityFlag(newFlag: boolean, time: Date, traceId: string) {
  const currentState = readJsonFile<AvailabilityState>(AVAILABILITY_STATE);

  if (newFlag === currentState.isAvailable) {
    return;
  }

  if (newFlag) {
    responseCount++;

    if (responseCount <= config["max-response-count"]) {
      return;
    }

    noResponseCount = 0;

    await handleUpdate(true, currentState.lastChange, time, traceId);
  } else {
    noResponseCount++;

    if (noResponseCount <= config["max-no-response-count"]) {
      return;
    }

    responseCount = 0;

    await handleUpdate(false, currentState.lastChange, time, traceId);
  }
}

async function handleUpdate(
  flag: boolean,
  lastCheckedTimestamp: string,
  time: Date,
  traceId: string,
) {
  const map = {
    DURATION: formatTimestamp(findDifference(lastCheckedTimestamp, time)),
    TIMESTAMP: time.toUTCString(),
  };
  let embed;

  if (flag) {
    embed = new EmbedBuilder()
      .setColor(Number(config.message.up.color))
      .setTitle(config.message.up.title)
      .setDescription(formatContent(config.message.up.description, map))
      .setTimestamp(time);
  } else {
    embed = new EmbedBuilder()
      .setColor(Number(config.message.down.color))
      .setTitle(config.message.down.title)
      .setDescription(formatContent(config.message.down.description, map))
      .setTimestamp(time);
  }

  for (const channelId of config["channel-ids"]) {
    await sendMessage(channelId, { embeds: [embed] });
  }

  writeJsonFile(AVAILABILITY_STATE, { isAvailable: flag, lastChecked: time.toISOString() });

  info(STATE_NAME, `Availability flag updated to ${flag}.`, traceId);
}
