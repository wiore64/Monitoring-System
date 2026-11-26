const MONTH = 30 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;
const HOUR = 60 * 60;
const MINUTE = 60;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const timestampFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

type Timestamp = string | number | Date;

export function formatDuration(duration: number): string {
  let remaining = Math.floor(duration / 1000);

  const months = Math.floor(remaining / MONTH);
  remaining %= MONTH;

  const days = Math.floor(remaining / DAY);
  remaining %= DAY;

  const hours = Math.floor(remaining / HOUR);
  remaining %= HOUR;

  const minutes = Math.floor(remaining / MINUTE);
  const seconds = remaining % MINUTE;

  const parts: string[] = [];

  if (months) {
    parts.push(`${months}mo`);
  }
  if (days) {
    parts.push(`${days}d`);
  }
  if (hours) {
    parts.push(`${hours}h`);
  }
  if (minutes) {
    parts.push(`${minutes}m`);
  }
  if (seconds || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

export function isInTimeRange(start: Timestamp, end: Timestamp, now: Timestamp): boolean {
  const startDate = toDate(start);
  const endDate = toDate(end);
  const nowDate = toDate(now);

  const startTime =
    startDate.getUTCHours() * 3600 + startDate.getUTCMinutes() * 60 + startDate.getUTCSeconds();
  const endTime =
    endDate.getUTCHours() * 3600 + endDate.getUTCMinutes() * 60 + endDate.getUTCSeconds();
  const nowTime =
    nowDate.getUTCHours() * 3600 + nowDate.getUTCMinutes() * 60 + nowDate.getUTCSeconds();

  return nowTime >= startTime && nowTime <= endTime;
}

export function isInDayAndTimeRange(start: Timestamp, end: Timestamp, now: Timestamp): boolean {
  const startTime = toNumber(start);
  const endTime = toNumber(end);
  const nowTime = toNumber(now);

  return nowTime >= startTime && nowTime <= endTime;
}

export function findDifference(now: Timestamp, before: Timestamp): number {
  return toNumber(now) - toNumber(before);
}

function toDate(timestamp: Timestamp): Date {
  return timestamp instanceof Date ? timestamp : new Date(timestamp);
}

function toNumber(timestamp: Timestamp): number {
  return typeof timestamp === "number" ? timestamp : toDate(timestamp).getTime();
}

export function formatDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

export function formatTimestamp(timestamp: Timestamp) {
  return timestampFormat.format(toDate(timestamp));
}
