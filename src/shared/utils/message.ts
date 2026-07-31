import {
  Message,
  type AttachmentBuilder,
  type EmbedBuilder,
  type MessageEditOptions,
  type MessageCreateOptions,
} from "discord.js";

import { client } from "#/bootstrap.js";
import { toError, translateNetworkError } from "#shared/error.js";

export type Payload = {
  content?: string;
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
};

export async function sendMessage(channelId: string, payload: Payload): Promise<Message> {
  try {
    const channel =
      client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));

    if (!channel) {
      throw new TypeError(`Channel not found: ${channelId}`);
    }
    if (!channel.isSendable()) {
      throw new TypeError(`Channel is not sendable: ${channelId}`);
    }

    return channel.send(buildOptions(payload));
  } catch (thing: unknown) {
    const error = toError(thing);

    if (!error) {
      throw new TypeError(`Non-error thrown: ${thing}`, error);
    }

    throw translateNetworkError(error);
  }
}

export async function editMessage(
  channelId: string,
  messageId: string,
  payload: Payload,
): Promise<Message> {
  try {
    const channel =
      client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));

    if (!channel) {
      throw new TypeError(`Channel not found: ${channelId}`);
    }
    if (!channel.isTextBased()) {
      throw new TypeError(`Channel is not text-based: ${channelId}`);
    }

    const message =
      channel.messages.cache.get(messageId) ?? (await channel.messages.fetch(messageId));

    if (!message) {
      throw new TypeError(`Message not found: ${messageId}`);
    }

    return message.edit(buildOptions(payload));
  } catch (thing: unknown) {
    const error = toError(thing);

    if (!error) {
      throw new TypeError(`Non-error thrown: ${thing}`, error);
    }

    throw translateNetworkError(error);
  }
}

export function formatContent(content: string, map: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(map)) {
    content = content.replaceAll(`{${key}}`, String(value));
  }

  return content;
}

function buildOptions(payload: Payload): MessageEditOptions & MessageCreateOptions {
  const options: MessageEditOptions & MessageCreateOptions = {};

  const embeds = payload.embeds;
  if (embeds) {
    options.embeds = embeds;
  }

  const files = payload.files;
  if (files) {
    options.files = files;
  }

  const content = payload.content;
  if (content !== undefined) {
    options.content = content;
  }

  return options;
}
