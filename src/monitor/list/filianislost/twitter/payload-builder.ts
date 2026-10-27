import config from "#data/filianislost/twitter/payload-config.json" with { type: "json" };
import { readJsonFile } from "#utils/file.js";
import { formatContent, type Payload } from "#utils/message.js";

import { type TwitterAccount } from "./monitor.js";

export function buildMainPayload(state: TwitterAccount, timestamp: string): Payload {
  return {};
}

export function buildUpdatePayload(): Payload {
  return {};
}

export function buildNewPostPayload(): Payload {
  return {};
}
