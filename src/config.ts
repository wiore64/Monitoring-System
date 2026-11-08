import { ValidationError } from "./shared/error.js";

export const CONFIG = {
  botToken: getEnvVar("BOT_TOKEN"),
  ytToken: getEnvVar("YT_TOKEN"),
} as const;

function getEnvVar(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new ValidationError(`Environment variable ${key} not found.`);
  }

  return value;
}
