import crypto from "node:crypto";

import { config as globalConfig } from "#/config.js";
import { HttpError } from "#shared/error.js";
import { readJsonFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { sendMessage } from "#utils/message.js";

import { buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "twitter/filian";
const MONITOR_CONFIG_PATH = "./data/twitter/filian/monitor-config.json";
const MONITOR_STATE_PATH = "./data/twitter/filian/monitor-state.json";
const LATEST_POSTS_INFO_PATH = "./data/twitter/filian/latest-posts-info.json";

type MonitorConfig = {
  "channel-id": string;
};

type MonitorState = {
  "is-initialized": boolean;
};

export type MonitorContext = {
  "timeout-ms": number;
};

type LatestPost = {
  content: string;
  hash: string;
};

type LatestPosts = {
  posts: LatestPost[];
  hash: string;
};

type TwitterCredentials = {
  auth: string;
  cookie: string;
  "x-csrf-token": string;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const config = readJsonFile<MonitorConfig>(MONITOR_CONFIG_PATH);
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const oldLatestPosts = readJsonFile<LatestPosts>(LATEST_POSTS_INFO_PATH);
  const newLatestPosts = await fetchLatestPosts(globalConfig.twitterAuth, context["timeout-ms"]);

  if (!state["is-initialized"]) {
    await initializeMonitor(state, newLatestPosts);
    return context;
  }

  if (compareLatestPostsHashes(oldLatestPosts.hash, newLatestPosts.hash)) {
    return context;
  }

  await handleUpdate(newLatestPosts, config["channel-id"], time, traceId);

  return context;
}

async function fetchLatestPosts(
  credentials: TwitterCredentials,
  timeoutMs: number,
): Promise<LatestPosts> {
  const response = await fetch(
    "https://x.com/i/api/graphql/T1x2zehUOKCWNpKwZCpnbg/UserTweets?variables=%7B%22userId%22%3A%221389652567941165058%22%2C%22count%22%3A20%2C%22includePromotedContent%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Atrue%2C%22withVoice%22%3Atrue%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22rweb_cashtags_enabled%22%3Atrue%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Atrue%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22rweb_cashtags_composer_attachment_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22rweb_conversational_replies_downvote_enabled%22%3Afalse%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22content_disclosure_indicator_enabled%22%3Atrue%2C%22content_disclosure_ai_generated_indicator_enabled%22%3Atrue%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Afalse%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Afalse%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Atrue%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticlePlainText%22%3Afalse%7D",
    {
      method: "GET",
      headers: {
        Authorization: credentials.auth,
        "Content-Type": "application/json",
        Cookie: credentials.cookie,
        "User-Agent": "",
        "X-Csrf-Token": credentials["x-csrf-token"],
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!response.ok) {
    throw new HttpError(
      "Failed to fetch latest posts.",
      response.status.toString(),
      response.statusText,
    );
  }

  const responseText = await response.text();
  const postTexts = [...responseText.matchAll(/"full_text"\s*:\s*"((?:\\.|[^"\\])*)"/g)].map(
    (match) => match[1]!,
  );

  if (!postTexts || Object.values(postTexts).length === 0) {
    throw new TypeError("Failed to extract the latest posts contents from the response.");
  }

  const postContents: LatestPost[] = postTexts.map((text) => ({
    content: text,
    hash: crypto.createHash("sha256").update(text).digest("hex"),
  }));

  return {
    posts: postContents,
    hash: crypto.createHash("sha256").update(postTexts.join("")).digest("hex"),
  };
}

async function initializeMonitor(state: MonitorState, latestPosts: LatestPosts): Promise<void> {
  state["is-initialized"] = true;

  updateLatestPosts(latestPosts);
}

function compareLatestPostsHashes(oldHash: string, newHash: string): boolean {
  return oldHash === newHash;
}

async function handleUpdate(
  latestPosts: LatestPosts,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildUpdatePayload(time);
  await sendMessage(channelId, payload);

  updateLatestPosts(latestPosts);

  info(LOG_NAME, "New Tweet was observed.", traceId);
}

function updateLatestPosts(latestPosts: LatestPosts): void {
  writeJsonFile(LATEST_POSTS_INFO_PATH, latestPosts);
}
