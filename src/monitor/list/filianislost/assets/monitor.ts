import crypto from "node:crypto";

import prettier from "prettier";

import { createDirectory, readJsonFile, writeFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "filianislost";
const MONITOR_CONFIG_PATH = "./data/filianislost/assets/monitor-config.json";
const MONITOR_STATE_PATH = "./data/filianislost/assets/monitor-state.json";
const MONITOR_ASSETS_PATH = "./data/filianislost/assets/assets/snapshots";
const MONITOR_ASSET_HISTORY_PATH = "./data/filianislost/assets/asset-history.json";
const MONITOR_ASSET_HASHES_PATH = "./data/filianislost/assets/asset-hashes.json";

type MonitorConfig = {
  "channel-id": string;
};

type MonitorState = {
  "message-id": string;
};

export type MonitorContext = {
  "timeout-ms": number;
};

type AssetType = "html" | "css" | "js";

type AssetHashes = {
  [T in AssetType]: string;
};

type AssetHistory = {
  [time: string]: {
    [T in AssetType]: string;
  };
};

type AssetInfo = {
  name: string;
  content: string;
  prettyContent: string;
  hash: string;
};

type AssetData = {
  [T in AssetType]: AssetInfo;
};

type AssetFetchResult = {
  data: AssetData;
  hashes: AssetHashes;
};

type ComparisonResult = {
  hasChanged: boolean;
  changedAssets: Set<keyof AssetHashes>;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const config = readJsonFile<MonitorConfig>(MONITOR_CONFIG_PATH);
  const state = readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  const oldAssetHashes = readJsonFile<AssetHashes>(MONITOR_ASSET_HASHES_PATH);
  const fetchResult = await fetchAssets(context["timeout-ms"]);

  if (state["message-id"].length === 0) {
    await initializeMonitor(fetchResult, state, config["channel-id"], time, traceId);
    return context;
  }

  const comparisonResult = compareAssets(oldAssetHashes, fetchResult.hashes);

  if (!comparisonResult.hasChanged) {
    return context;
  }

  await handleUpdate(
    fetchResult,
    comparisonResult.changedAssets,
    config["channel-id"],
    state["message-id"],
    time,
    traceId,
  );

  return context;
}

async function fetchAssets(timeoutMs: number): Promise<AssetFetchResult> {
  const pageHtmlText = await fetchAssetContent("https://filianislost.com", timeoutMs);

  const chunkNames = pageHtmlText.match(/chunk-[a-z0-9]+\.(?:css|js)/g);

  if (!chunkNames) {
    throw new TypeError("Unable to retrieve chunks.");
  }

  const chunkCssName = chunkNames.find((name) => name.endsWith(".css"));
  const chunkJsName = chunkNames.find((name) => name.endsWith(".js"));

  if (!chunkCssName || !chunkJsName) {
    throw new TypeError(
      `Unable to retrieve one of chunks. CSS: ${chunkCssName}; JS: ${chunkJsName}.`,
    );
  }

  const [pageCssText, pageJsText] = await Promise.all([
    fetchAssetContent(`https://filianislost.com/${chunkCssName}`, timeoutMs),
    fetchAssetContent(`https://filianislost.com/${chunkJsName}`, timeoutMs),
  ]);

  const pageHtmlHash = crypto.createHash("sha256").update(pageHtmlText).digest("hex");
  const pageCssHash = crypto.createHash("sha256").update(pageCssText).digest("hex");
  const pageJsHash = crypto.createHash("sha256").update(pageJsText).digest("hex");

  return {
    data: {
      html: {
        name: "index.html",
        content: pageHtmlText,
        prettyContent: await prettifyAsset("html", pageHtmlText),
        hash: pageHtmlHash,
      },
      css: {
        name: chunkCssName,
        content: pageCssText,
        prettyContent: await prettifyAsset("css", pageCssText),
        hash: pageCssHash,
      },
      js: {
        name: chunkJsName,
        content: pageJsText,
        prettyContent: await prettifyAsset("js", pageJsText),
        hash: pageJsHash,
      },
    },
    hashes: {
      html: pageHtmlHash,
      css: pageCssHash,
      js: pageJsHash,
    },
  };
}

async function fetchAssetContent(url: string, timeoutMs: number): Promise<string> {
  return (await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })).text();
}

async function prettifyAsset(assetType: AssetType, content: string): Promise<string> {
  switch (assetType) {
    case "html":
      return await prettier.format(content, { parser: "html" });

    case "css":
      return await prettier.format(content, { parser: "css" });

    case "js":
      return await prettier.format(content, { parser: "babel" });

    default:
      throw new TypeError(`Unknown asset type: ${assetType}`);
  }
}

async function initializeMonitor(
  fetchResult: AssetFetchResult,
  state: MonitorState,
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(time);
  const message = await sendMessage(channelId, payload);

  state["message-id"] = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareAssets(newAssetHashes: AssetHashes, oldAssetHashes: AssetHashes): ComparisonResult {
  const changedAssets = new Set<keyof AssetHashes>();

  for (const [key, newHash] of Object.entries(newAssetHashes)) {
    // The key is guaranteed to be a keyof AssetHashes
    const oldHash = oldAssetHashes[key as keyof AssetHashes];

    if (newHash === oldHash) {
      continue;
    }

    changedAssets.add(key as keyof AssetHashes);
  }

  return {
    hasChanged: changedAssets.size > 0,
    changedAssets,
  };
}

async function handleUpdate(
  fetchResult: AssetFetchResult,
  changedAssets: Set<keyof AssetHashes>,
  channelId: string,
  messageId: string,
  time: Date,
  traceId: string,
): Promise<void> {}

function storeChangedAssets(assetData: AssetData, timestamp: string): void {
  const dirPath = `${MONITOR_ASSETS_PATH}/${timestamp.replaceAll(":", "-").slice(0, timestamp.length - 6)}`;
  createDirectory(dirPath);

  for (const [key, assetInfo] of Object.entries(assetData)) {
    writeFile(`${dirPath}/${assetInfo.name}`, assetInfo.content);

    if (key === "html") {
      continue;
    }

    writeFile(`${dirPath}/pretty-${assetInfo.name}`, assetInfo.prettyContent);
  }
}

function updateAssetHistory(cssAssetName: string, jsAssetName: string, time: Date) {
  const currentHistory = readJsonFile<AssetHistory>(MONITOR_ASSET_HISTORY_PATH);

  writeJsonFile(MONITOR_ASSET_HISTORY_PATH, {
    ...currentHistory,
    [time.toISOString()]: { css: cssAssetName, js: jsAssetName },
  });
}

function updateAssetHashes(hashes: AssetHashes) {
  writeJsonFile(MONITOR_ASSET_HASHES_PATH, hashes);
}
