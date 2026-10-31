import { DiscordAPIError, HTTPError, Message, type BaseMessageOptions } from "discord.js";

import { client } from "#root/bootstrap.js";
import { toError, classifyNetworkError, ValidationError, HttpError } from "#shared/error.js";

export type Payload = BaseMessageOptions;

export async function sendMessage(channelId: string, payload: Payload): Promise<Message> {
  try {
    const channel =
      client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));

    if (!channel) {
      throw new ValidationError(`Channel not found: ${channelId}`);
    }

    if (!channel.isSendable()) {
      throw new ValidationError(`Channel not sendable: ${channelId}`);
    }

    return await channel.send(payload);
  } catch (cause: unknown) {
    const error = toError(cause);

    if (!error) {
      throw new ValidationError(`Non-error thrown: ${JSON.stringify(cause)}`);
    }

    if (error instanceof ValidationError) {
      throw error;
    }

    if (error instanceof HTTPError || error instanceof DiscordAPIError) {
      throw new HttpError(error.message, String(error.status), error);
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
      throw new ValidationError(`Channel not found: ${channelId}`);
    }

    if (!channel.isTextBased()) {
      throw new ValidationError(`Channel not text-based: ${channelId}`);
    }

    const message =
      channel.messages.cache.get(messageId) ?? (await channel.messages.fetch(messageId));

    if (!message) {
      throw new ValidationError(`Message not found: ${messageId}`);
    }

    return await message.edit(payload);
  } catch (cause: unknown) {
    const error = toError(cause);

    if (!error) {
      throw new ValidationError(`Non-error thrown: ${JSON.stringify(cause)}`);
    }

    if (error instanceof ValidationError) {
      throw error;
    }

    if (error instanceof HTTPError || error instanceof DiscordAPIError) {
      throw new HttpError(error.message, String(error.status), error);
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
