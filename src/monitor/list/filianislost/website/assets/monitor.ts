import crypto from "node:crypto";

import prettier from "prettier";

import config from "#data/filianislost/website/assets/monitor-config.json" with { type: "json" };
import state from "#data/filianislost/website/assets/monitor-state.json" with { type: "json" };
import { HttpError } from "#shared/error.js";
import { createDirectory, readJsonFile, writeFile, writeJsonFile } from "#utils/file.js";
import { info } from "#utils/logger.js";
import { editMessage, sendMessage } from "#utils/message.js";

import { buildMainPayload, buildUpdatePayload } from "./payload-builder.js";

const LOG_NAME = "filianislost/assets";
const MONITOR_STATE_PATH = "./data/filianislost/website/assets/monitor-state.json";
const ASSETS_SNAPSHOTS_PATH = "./data/filianislost/website/assets/assets/snapshots";
const ASSET_HISTORY_PATH = "./data/filianislost/website/assets/asset-history.json";
const ASSET_HASHES_PATH = "./data/filianislost/website/assets/asset-hashes.json";

export type MonitorContext = {
  timeoutMs: number;
};

export type AssetName = "html" | "css" | "js";

type AssetHashes = {
  [T in AssetName]: string;
};

type AssetHistory = {
  [timestamp: string]: {
    [T in AssetName]: string;
  };
};

type AssetInfo = {
  name: string;
  content: string;
  prettyContent: string;
  hash: string;
};

type AssetData = {
  [T in AssetName]: AssetInfo;
};

type AssetFetchResult = {
  data: AssetData;
  hashes: AssetHashes;
};

type ComparisonResult = {
  hasChanges: boolean;
  changedAssets: Set<AssetName>;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const oldAssetHashes = readJsonFile<AssetHashes>(ASSET_HASHES_PATH);
  const fetchResult = await fetchAssets(context.timeoutMs);

  if (state.messageId.length === 0) {
    await initializeMonitor(fetchResult, config["channel-id"], time, traceId);
    return context;
  }

  const comparisonResult = compareAssets(oldAssetHashes, fetchResult.hashes);

  if (!comparisonResult.hasChanges) {
    return context;
  }

  await handleUpdate(
    fetchResult,
    comparisonResult.changedAssets,
    config["channel-id"],
    state.messageId,
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

  const [prettyHtml, prettyCss, prettyJs] = await Promise.all([
    prettifyContent("html", pageHtmlText),
    prettifyContent("css", pageCssText),
    prettifyContent("js", pageJsText),
  ]);

  return {
    data: {
      html: {
        name: "index.html",
        content: pageHtmlText,
        prettyContent: prettyHtml,
        hash: pageHtmlHash,
      },
      css: {
        name: chunkCssName,
        content: pageCssText,
        prettyContent: prettyCss,
        hash: pageCssHash,
      },
      js: {
        name: chunkJsName,
        content: pageJsText,
        prettyContent: prettyJs,
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
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

  if (!response.ok) {
    throw new HttpError(
      "Failed to fetch asset content.",
      response.status.toString(),
      response.statusText,
    );
  }

  return await response.text();
}

async function prettifyContent(assetType: AssetName, content: string): Promise<string> {
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
  channelId: string,
  time: Date,
  traceId: string,
): Promise<void> {
  const payload = buildMainPayload(time);
  const message = await sendMessage(channelId, payload);

  state.messageId = message.id;
  writeJsonFile(MONITOR_STATE_PATH, state);

  storeChangedAssets(fetchResult.data, time.toISOString());
  updateAssetHistory(
    fetchResult.data.html.name,
    fetchResult.data.css.name,
    fetchResult.data.js.name,
    time,
  );
  updateAssetHashes(fetchResult.hashes);

  info(LOG_NAME, "Initialized.", traceId);
}

function compareAssets(newAssetHashes: AssetHashes, oldAssetHashes: AssetHashes): ComparisonResult {
  const changedAssets = new Set<keyof AssetHashes>();

  for (const key of Object.keys(newAssetHashes) as (keyof AssetHashes)[]) {
    if (newAssetHashes[key] === oldAssetHashes[key]) {
      continue;
    }

    changedAssets.add(key);
  }

  return {
    hasChanges: changedAssets.size > 0,
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
): Promise<void> {
  const mainPayload = buildMainPayload(time);
  await editMessage(channelId, messageId, mainPayload);

  for (const assetName of changedAssets) {
    const updatePayload = buildUpdatePayload(assetName, time);
    await sendMessage(channelId, updatePayload);

    info(LOG_NAME, `${assetName} observed to be updated.`, traceId);
  }

  storeChangedAssets(fetchResult.data, time.toISOString());
  updateAssetHistory(
    fetchResult.data.html.name,
    fetchResult.data.css.name,
    fetchResult.data.js.name,
    time,
  );
  updateAssetHashes(fetchResult.hashes);
}

function storeChangedAssets(assetData: AssetData, timestamp: string): void {
  const directoryTimestamp = timestamp.replaceAll(":", "-").slice(0, timestamp.length - 6);
  const dirPath = `${ASSETS_SNAPSHOTS_PATH}/${directoryTimestamp}`;
  createDirectory(dirPath);

  for (const [key, assetInfo] of Object.entries(assetData)) {
    writeFile(`${dirPath}/${assetInfo.name}`, assetInfo.content);

    // html is already pretty enough!
    if (key === "html") {
      continue;
    }

    writeFile(`${dirPath}/pretty-${assetInfo.name}`, assetInfo.prettyContent);
  }
}

function updateAssetHistory(
  htmlAssetName: string,
  cssAssetName: string,
  jsAssetName: string,
  time: Date,
): void {
  const currentHistory = readJsonFile<AssetHistory>(ASSET_HISTORY_PATH);

  writeJsonFile(ASSET_HISTORY_PATH, {
    ...currentHistory,
    [time.toISOString()]: {
      html: htmlAssetName,
      css: cssAssetName,
      js: jsAssetName,
    },
  });
}

function updateAssetHashes(hashes: AssetHashes): void {
  writeJsonFile(ASSET_HASHES_PATH, hashes);
}
