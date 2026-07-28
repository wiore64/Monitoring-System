export const config = {
  botToken: getEnvVar("BOT_TOKEN"),
  ytToken: getEnvVar("YT_TOKEN"),
  twitterAuth: {
    auth: getEnvVar("TWITTER_AUTH"),
    cookie: getEnvVar("TWITTER_COOKIE"),
    "x-csrf-token": getEnvVar("TWITTER_X_CSRF_TOKEN"),
  },
} as const;

function getEnvVar(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Environment variable ${key} not found.`);
  }

  return value;
}
