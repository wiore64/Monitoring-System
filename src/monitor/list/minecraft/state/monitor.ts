export type MonitorContext = {
  "timeout-ms": number;
};

export const schedulerHooks = {};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  return context;
}
