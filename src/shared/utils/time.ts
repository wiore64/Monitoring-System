const MONTH = 30 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;
const HOUR = 60 * 60;
const MINUTE = 60;

export type Timestamp = string | number | Date;

export function formatTimestamp(timestamp: Timestamp): string {
  let remaining = Math.floor(toDate(timestamp).getTime() / 1000);

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
    startDate.getHours() * 3600 + startDate.getMinutes() * 60 + startDate.getSeconds();
  const endTime = endDate.getHours() * 3600 + endDate.getMinutes() * 60 + endDate.getSeconds();
  const nowTime = nowDate.getHours() * 3600 + nowDate.getMinutes() * 60 + nowDate.getSeconds();

  return nowTime >= startTime && nowTime <= endTime;
}

export function isInDayOfWeekAndTimeRange(
  start: Timestamp,
  end: Timestamp,
  now: Timestamp,
): boolean {
  const startDate = toDate(start);
  const endDate = toDate(end);
  const nowDate = toDate(now);

  const startTime = getAdjustedDayOfWeek(startDate.getDay());
  const endTime = getAdjustedDayOfWeek(endDate.getDay());
  const nowTime = getAdjustedDayOfWeek(nowDate.getDay());

  return nowTime >= startTime && nowTime <= endTime && isInTimeRange(start, end, now);
}

export function findDifference(now: Timestamp, before: Timestamp): number {
  const nowDate = toDate(now);
  const beforeDate = toDate(before);

  return nowDate.getTime() - beforeDate.getTime();
}

function toDate(timestamp: Timestamp): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }

  if (typeof timestamp === "string") {
    return new Date(timestamp);
  }

  if (typeof timestamp === "number") {
    return new Date(timestamp);
  }

  throw new TypeError(`Invalid timestamp: ${timestamp}`);
}

function getAdjustedDayOfWeek(dayOfWeek: number): number {
  switch (dayOfWeek) {
    case 0:
      return 6;
    case 1:
      return 0;
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 3;
    case 5:
      return 4;
    case 6:
      return 5;
    default:
      throw new TypeError(`Invalid day of week: ${dayOfWeek}`);
  }
}
