import { readJsonFile } from "#utils/file.js";

const LOG_NAME = "filianislost";
const MONITOR_CONFIG_PATH = "./data/filianislost/assets/monitor-config.json";
const MONITOR_STATE_PATH = "./data/filianislost/assets/monitor-state.json";

type MonitorConfig = {
  "channel-id": string;
};

type MonitorState = {
  "message-id": string;
};

export type MonitorContext = {
  "timeout-ms": number;
};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  const config = await readJsonFile<MonitorConfig>(MONITOR_CONFIG_PATH);
  const state = await readJsonFile<MonitorState>(MONITOR_STATE_PATH);

  return context;
}
