import { ValidationError } from "./shared/error.js";

export const CONFIG = {
  botToken: getEnvVar("BOT_TOKEN"),
  ytToken: getEnvVar("YT_TOKEN"),
  twitterAuth: {
    Authorization: getEnvVar("TWITTER_AUTH"),
    Cookie: getEnvVar("TWITTER_COOKIE"),
    "X-Csrf-Token": getEnvVar("TWITTER_X_CSRF_TOKEN"),
  },
  redditAuth: {
    Cookie: getEnvVar("REDDIT_SESSION_ID"),
  },
} as const;

function getEnvVar(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new ValidationError(`Environment variable ${key} not found.`);
  }

  return value;
}
