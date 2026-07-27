import { startManualRefresh } from './manual-refresh-runner.js';

export const DEFAULT_REFRESH_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const DEFAULT_REFRESH_TIMES = ['03:00', '15:00'] as const;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
}

let timer: NodeJS.Timeout | null = null;
let nextRunAt: string | null = null;
let lastTriggeredAt: string | null = null;

export function parseRefreshTimes(value: string | undefined) {
  const source = value?.split(',') ?? [...DEFAULT_REFRESH_TIMES];
  const valid = source
    .map((item) => item.trim())
    .filter((item) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item));
  return [...new Set(valid)].sort();
}

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: number('year'),
    month: number('month'),
    day: number('day'),
    hour: number('hour'),
    minute: number('minute'),
    second: number('second'),
  };
}

function timeZoneOffset(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(value.getTime() / 1_000) * 1_000;
}

function localDateAt(date: ZonedParts, hours: number, minutes: number, timeZone: string) {
  const wallClockUtc = Date.UTC(date.year, date.month - 1, date.day, hours, minutes);
  let candidate = wallClockUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    candidate = wallClockUtc - timeZoneOffset(new Date(candidate), timeZone);
  }
  return new Date(candidate);
}

export function nextScheduledRefresh(
  now = new Date(),
  times = parseRefreshTimes(process.env.SALICE_AUTO_REFRESH_TIMES),
  timeZone = process.env.SALICE_AUTO_REFRESH_TIME_ZONE || DEFAULT_REFRESH_TIME_ZONE,
) {
  if (!times.length) return null;
  const local = zonedParts(now, timeZone);
  const calendarOrigin = Date.UTC(local.year, local.month - 1, local.day);
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    const calendar = new Date(calendarOrigin + dayOffset * 86_400_000);
    const date = {
      year: calendar.getUTCFullYear(),
      month: calendar.getUTCMonth() + 1,
      day: calendar.getUTCDate(),
    };
    for (const time of times) {
      const [hours, minutes] = time.split(':').map(Number);
      const candidate = localDateAt(date, hours, minutes, timeZone);
      if (candidate.getTime() > now.getTime()) candidates.push(candidate);
    }
  }
  return candidates.sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

export function previousScheduledRefresh(
  now = new Date(),
  times = parseRefreshTimes(process.env.SALICE_AUTO_REFRESH_TIMES),
  timeZone = process.env.SALICE_AUTO_REFRESH_TIME_ZONE || DEFAULT_REFRESH_TIME_ZONE,
) {
  if (!times.length) return null;
  const local = zonedParts(now, timeZone);
  const calendarOrigin = Date.UTC(local.year, local.month - 1, local.day);
  const candidates: Date[] = [];
  for (let dayOffset = -2; dayOffset <= 0; dayOffset += 1) {
    const calendar = new Date(calendarOrigin + dayOffset * 86_400_000);
    const date = {
      year: calendar.getUTCFullYear(),
      month: calendar.getUTCMonth() + 1,
      day: calendar.getUTCDate(),
    };
    for (const time of times) {
      const [hours, minutes] = time.split(':').map(Number);
      const candidate = localDateAt(date, hours, minutes, timeZone);
      if (candidate.getTime() <= now.getTime()) candidates.push(candidate);
    }
  }
  return candidates.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

export function automaticRefreshStatus() {
  const enabled = process.env.SALICE_AUTO_REFRESH_ENABLED === 'true';
  return {
    enabled,
    timeZone: process.env.SALICE_AUTO_REFRESH_TIME_ZONE || DEFAULT_REFRESH_TIME_ZONE,
    times: parseRefreshTimes(process.env.SALICE_AUTO_REFRESH_TIMES),
    nextRunAt: enabled ? nextRunAt : null,
    lastTriggeredAt,
  };
}

function scheduleNext(workspace: string) {
  if (timer) clearTimeout(timer);
  const status = automaticRefreshStatus();
  if (!status.enabled || !status.times.length) {
    timer = null;
    nextRunAt = null;
    return;
  }
  const next = nextScheduledRefresh(new Date(), status.times, status.timeZone);
  if (!next) return;
  nextRunAt = next.toISOString();
  const delay = Math.max(1_000, next.getTime() - Date.now());
  timer = setTimeout(() => {
    lastTriggeredAt = new Date().toISOString();
    const result = startManualRefresh(workspace, 'scheduled');
    if (!result.started) {
      console.warn('La actualización programada no comenzó porque ya existe otra ejecución activa.');
    }
    scheduleNext(workspace);
  }, delay);
  timer.unref();
}

export function startAutomaticRefreshScheduler(
  workspace = process.cwd(),
  options: { bootstrap?: boolean; lastSuccessfulAt?: string | null } = {},
) {
  scheduleNext(workspace);
  const status = automaticRefreshStatus();
  const latestScheduled = previousScheduledRefresh(new Date(), status.times, status.timeZone);
  const lastSuccess = options.lastSuccessfulAt ? new Date(options.lastSuccessfulAt) : null;
  const catchUp = Boolean(
    latestScheduled
    && (!lastSuccess || !Number.isFinite(lastSuccess.getTime()) || lastSuccess < latestScheduled),
  );
  if (status.enabled && (options.bootstrap || catchUp)) {
    const catchUpTimer = setTimeout(() => {
      lastTriggeredAt = new Date().toISOString();
      const result = startManualRefresh(workspace, options.bootstrap ? 'bootstrap' : 'scheduled');
      if (!result.started) {
        console.warn('La actualización pendiente no comenzó porque ya existe otra ejecución activa.');
      }
    }, 1_000);
    catchUpTimer.unref();
  }
  return automaticRefreshStatus();
}

export function stopAutomaticRefreshScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
  nextRunAt = null;
}
