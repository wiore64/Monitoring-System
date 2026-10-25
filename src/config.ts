import { ValidationError } from "./shared/error.js";

export const CONFIG = {
  botToken: getEnvVar("BOT_TOKEN"),
  ytToken: getEnvVar("YT_TOKEN"),
  twitterAuth: {
    auth: getEnvVar("TWITTER_AUTH"),
    cookie: getEnvVar("TWITTER_COOKIE"),
    "x-csrf-token": getEnvVar("TWITTER_X_CSRF_TOKEN"),
  },
  redditSessionId: getEnvVar("REDDIT_SESSION_ID"),
} as const;

function getEnvVar(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new ValidationError(`Environment variable ${key} not found.`);
  }

  return value;
}
