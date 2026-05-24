type LocalDateParts = {
  year: number
  month: number
  day: number
}

type LocalDateTimeParts = LocalDateParts & {
  hour: number
  minute: number
  second: number
}

function toUtcTimestamp(parts: LocalDateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
}

function atLocalMidnight(parts: LocalDateParts): LocalDateTimeParts {
  return {
    ...parts,
    hour: 0,
    minute: 0,
    second: 0,
  }
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function getTimeZoneParts(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = getFormatter(timeZone).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  )

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function shiftLocalDate(parts: LocalDateParts, days: number): LocalDateParts {
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  utcDate.setUTCDate(utcDate.getUTCDate() + days)

  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
  }
}

function zonedDateTimeToUtc(
  timeZone: string,
  parts: LocalDateTimeParts
): Date {
  const targetAsUtc = toUtcTimestamp(parts)
  let guess = targetAsUtc

  for (let i = 0; i < 4; i++) {
    const actual = getTimeZoneParts(new Date(guess), timeZone)
    const actualAsUtc = toUtcTimestamp(actual)

    const diff = targetAsUtc - actualAsUtc
    guess += diff

    if (diff === 0) {
      break
    }
  }

  return new Date(guess)
}

export function getLocalHour(date: Date, timeZone: string): number {
  return getTimeZoneParts(date, timeZone).hour
}

export function getLocalHourSafe(date: Date, timeZone: string): number {
  try {
    return getLocalHour(date, timeZone)
  } catch {
    return -1
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function getLocalWeekday(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).formatToParts(date)
    const weekday = parts.find((p) => p.type === 'weekday')?.value
    return weekday ? WEEKDAY_INDEX[weekday] ?? -1 : -1
  } catch {
    return -1
  }
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone })
    return true
  } catch {
    return false
  }
}

export function getLocalDayRangeUtc(
  referenceDate: Date,
  timeZone: string,
  offsetDays: number = 0
) {
  const localNow = getTimeZoneParts(referenceDate, timeZone)
  const startDay = shiftLocalDate(localNow, offsetDays)
  const endDay = shiftLocalDate(startDay, 1)

  const start = zonedDateTimeToUtc(timeZone, atLocalMidnight(startDay))
  const end = zonedDateTimeToUtc(timeZone, atLocalMidnight(endDay))

  return {
    start,
    end,
    localDate: startDay,
  }
}
