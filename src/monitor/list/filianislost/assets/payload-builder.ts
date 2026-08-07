import { readJsonFile } from "#utils/file.js";
import { type Payload } from "#utils/message.js";

type PayloadConfig = {
  main: PayloadMainConfig;
  update: PayloadUpdateConfig;
};

type PayloadMainConfig = {
  color: string;
  description: string;
};

type PayloadUpdateConfig = {
  color: string;
  title: string;
  description: string;
};

const PAYLOAD_CONFIG_PATH = "./data/filianislost/assets/payload-config.json";

export function buildMainPayload(time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).main;

  return {};
}

export function buildUpdatePayload(time: Date): Payload {
  const config = readJsonFile<PayloadConfig>(PAYLOAD_CONFIG_PATH).update;

  return {};
}
