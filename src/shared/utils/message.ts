import {
  Message,
  type AttachmentBuilder,
  type EmbedBuilder,
  type MessageCreateOptions,
  type MessageEditOptions,
} from "discord.js";

// Are we sure about the current error handling technique?

import { client } from "#root/bootstrap.js";
import { toError, classifyNetworkError, ValidationError } from "#shared/error.js";

export type Payload = {
  content?: string;
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
};

export async function sendMessage(payload: Payload, channelId: string): Promise<Message> {
  try {
    const channel =
      client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));

    if (!channel) {
      throw new ValidationError(`Channel not found: ${channelId}`, "CHANNEL_NOT_FOUND");
    }

    if (!channel.isSendable()) {
      throw new ValidationError(`Channel is not sendable: ${channelId}`, "CHANNEL_NOT_SENDABLE");
    }

    return await channel.send(buildOptions(payload));
  } catch (cause: unknown) {
    const error = toError(cause);

    if (!error) {
      throw new ValidationError(`Non-error thrown: ${JSON.stringify(cause)}`, "NON_ERROR");
    }

    if (error instanceof ValidationError) {
      throw error;
    }

    throw classifyNetworkError(error);
  }
}

export async function editMessage(
  payload: Payload,
  channelId: string,
  messageId: string,
): Promise<Message> {
  try {
    const channel =
      client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));

    if (!channel) {
      throw new ValidationError(`Channel not found: ${channelId}`, "CHANNEL_NOT_FOUND");
    }

    if (!channel.isTextBased()) {
      throw new ValidationError(
        `Channel is not text-based: ${channelId}`,
        "CHANNEL_NOT_TEXT_BASED",
      );
    }

    const message =
      channel.messages.cache.get(messageId) ?? (await channel.messages.fetch(messageId));

    if (!message) {
      throw new ValidationError(`Message not found: ${messageId}`, "MESSAGE_NOT_FOUND");
    }

    return await message.edit(buildOptions(payload));
  } catch (cause: unknown) {
    const error = toError(cause);

    if (!error) {
      throw new ValidationError(`Non-error thrown: ${JSON.stringify(cause)}`, "NON_ERROR");
    }

    if (error instanceof ValidationError) {
      throw error;
    }

    throw classifyNetworkError(error);
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
