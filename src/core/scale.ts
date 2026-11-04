/**
 * Scales: how a domain value becomes a pixel, and which values get a tick.
 *
 * Every axis in the package is one of these, category axes included. A category is its row index on a
 * linear scale running from -0.5 to n-0.5, so a band is exactly one unit wide, and zooming a category
 * axis is the same arithmetic as zooming a numeric one.
 */

/** What an axis measures */
export type ScaleKind = "category" | "linear" | "log" | "time"

export type Scale = {
    readonly kind: ScaleKind
    /** The domain's low end, in the axis's own units (milliseconds for `time`) */
    readonly min: number
    /** The domain's high end */
    readonly max: number
    map: (value: number) => number
    invert: (pixel: number) => number
}

/** Rounds a raw axis range out to human-readable tick values */
export function niceTicks(min: number, max: number, targetCount: number): number[] {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return [0]
    }
    if (min === max) {
        // A flat series still needs an axis; give it one tick above and below rather than a
        // degenerate zero-height scale that would divide by zero below.
        return [min - 1, min, min + 1]
    }
    const rawStep = (max - min) / Math.max(1, targetCount)
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
    // 1/2/5/10 steps are what people read as round numbers, whatever the magnitude
    const candidates = [1, 2, 5, 10].map(m => m * magnitude)
    const step = candidates.find(c => c >= rawStep) ?? candidates[candidates.length - 1]
    const start = Math.floor(min / step) * step
    const end = Math.ceil(max / step) * step
    const ticks: number[] = []
    // Accumulate with an epsilon so float drift can't drop the final tick
    for (let value = start; value <= end + step * 1e-9; value += step) {
        // Re-round each step: repeated addition of 0.1 drifts visibly by the tenth tick
        ticks.push(Number((Math.round(value / step) * step).toFixed(10)))
    }
    return ticks
}

/** Ticks inside a fixed range, for an axis whose ends the caller chose and which must not move */
export function ticksWithin(min: number, max: number, targetCount: number): number[] {
    return niceTicks(min, max, targetCount).filter(tick => tick >= min - 1e-9 && tick <= max + 1e-9)
}

/** A scale that is straight-line proportional across the domain. A time scale is one of these too */
export function linearScale(kind: ScaleKind, min: number, max: number, from: number, to: number): Scale {
    const span = max - min
    const pixels = to - from
    return {
        kind, min, max,
        map: span === 0 ? () => (from + to) / 2 : (value) => from + ((value - min) / span) * pixels,
        invert: pixels === 0 ? () => min : (pixel) => min + ((pixel - from) / pixels) * span,
    }
}

/** A base-10 logarithmic scale. Anything at or below zero has no position, and sits at the low end */
export function logScale(min: number, max: number, from: number, to: number): Scale {
    const low = Math.log10(min)
    const span = Math.log10(max) - low
    const pixels = to - from
    return {
        kind: "log", min, max,
        map: span === 0
            ? () => (from + to) / 2
            : (value) => from + ((value > 0 ? Math.log10(value) - low : 0) / span) * pixels,
        invert: pixels === 0 ? () => min : (pixel) => Math.pow(10, low + ((pixel - from) / pixels) * span),
    }
}

/** The whole decades around a positive range, which is what a log axis's ends should be */
export function logDomain(min: number, max: number): [number, number] {
    const low = min > 0 ? Math.pow(10, Math.floor(Math.log10(min))) : 1
    const high = max > 0 ? Math.pow(10, Math.ceil(Math.log10(max))) : 10
    return low === high ? [low, high * 10] : [low, high]
}

/** Decades, plus their 2s and 5s when the range is too short for decades alone to read */
export function logTicks(min: number, max: number): number[] {
    const ticks: number[] = []
    const decades = Math.log10(max / min)
    const steps = decades < 3 ? [1, 2, 5] : [1]
    for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
        for (const step of steps) {
            const tick = Number((step * Math.pow(10, exponent)).toPrecision(12))
            if (tick >= min * (1 - 1e-9) && tick <= max * (1 + 1e-9)) {
                ticks.push(tick)
            }
        }
    }
    return ticks
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The spacings a time axis may use. Months and years come out of the calendar rather than a duration */
const TIME_STEPS: {unit: "ms" | "day" | "month", step: number, size: number}[] = [
    ...[1, 2, 5, 10, 25, 50, 100, 250, 500].map(step => ({unit: "ms" as const, step, size: step})),
    {unit: "ms", step: SECOND, size: SECOND},
    {unit: "ms", step: 5 * SECOND, size: 5 * SECOND},
    {unit: "ms", step: 15 * SECOND, size: 15 * SECOND},
    {unit: "ms", step: 30 * SECOND, size: 30 * SECOND},
    {unit: "ms", step: MINUTE, size: MINUTE},
    {unit: "ms", step: 5 * MINUTE, size: 5 * MINUTE},
    {unit: "ms", step: 15 * MINUTE, size: 15 * MINUTE},
    {unit: "ms", step: 30 * MINUTE, size: 30 * MINUTE},
    {unit: "ms", step: HOUR, size: HOUR},
    {unit: "ms", step: 3 * HOUR, size: 3 * HOUR},
    {unit: "ms", step: 6 * HOUR, size: 6 * HOUR},
    {unit: "ms", step: 12 * HOUR, size: 12 * HOUR},
    {unit: "day", step: 1, size: DAY},
    {unit: "day", step: 2, size: 2 * DAY},
    {unit: "day", step: 7, size: 7 * DAY},
    {unit: "day", step: 14, size: 14 * DAY},
    {unit: "month", step: 1, size: 30 * DAY},
    {unit: "month", step: 3, size: 91 * DAY},
    {unit: "month", step: 6, size: 182 * DAY},
    {unit: "month", step: 12, size: 365 * DAY},
    {unit: "month", step: 24, size: 730 * DAY},
    {unit: "month", step: 60, size: 1826 * DAY},
    {unit: "month", step: 120, size: 3652 * DAY},
]

/** Ticks on a time axis and the format that suits their spacing */
export function timeTicks(min: number, max: number, targetCount: number, utc: boolean): {ticks: number[], format: (value: number) => string} {
    const want = (max - min) / Math.max(1, targetCount)
    const choice = TIME_STEPS.find(candidate => candidate.size >= want) ?? TIME_STEPS[TIME_STEPS.length - 1]
    const ticks: number[] = []
    if (choice.unit === "ms") {
        // Aligned to local time, so an hourly axis ticks on the hour in a half-hour time zone too
        const offset = utc ? 0 : new Date(min).getTimezoneOffset() * MINUTE
        let tick = Math.ceil((min - offset) / choice.step) * choice.step + offset
        for (; tick <= max; tick += choice.step) {
            ticks.push(tick)
        }
    } else if (choice.unit === "day") {
        // Calendar arithmetic rather than adding 24 hours, which walks off midnight at a DST change
        const start = new Date(min)
        if (utc) {start.setUTCHours(0, 0, 0, 0)} else {start.setHours(0, 0, 0, 0)}
        const cursor = new Date(start)
        while (cursor.getTime() <= max) {
            if (cursor.getTime() >= min) {
                ticks.push(cursor.getTime())
            }
            if (utc) {cursor.setUTCDate(cursor.getUTCDate() + choice.step)} else {cursor.setDate(cursor.getDate() + choice.step)}
        }
    } else {
        const start = new Date(min)
        const startMonth = utc ? start.getUTCFullYear() * 12 + start.getUTCMonth() : start.getFullYear() * 12 + start.getMonth()
        for (let month = Math.floor(startMonth / choice.step) * choice.step; ; month += choice.step) {
            const year = Math.floor(month / 12)
            const tick = utc ? Date.UTC(year, month - year * 12, 1) : new Date(year, month - year * 12, 1).getTime()
            if (tick > max) {
                break
            }
            if (tick >= min) {
                ticks.push(tick)
            }
        }
    }
    const timeZone = utc ? "UTC" : undefined
    // No locale named, so dates read in the browser's own language and this package bakes in none
    const options: Intl.DateTimeFormatOptions = choice.unit === "month"
        ? (choice.step >= 12 ? {year: "numeric", timeZone} : {month: "short", year: "2-digit", timeZone})
        : choice.unit === "day"
            ? {month: "short", day: "numeric", timeZone}
            : (choice.size < SECOND
                ? {hour: "numeric", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, timeZone}
                : choice.size < MINUTE
                    ? {hour: "numeric", minute: "2-digit", second: "2-digit", timeZone}
                    : {hour: "numeric", minute: "2-digit", timeZone})
    const formatter = new Intl.DateTimeFormat(undefined, options)
    return {ticks, format: (value) => formatter.format(value)}
}

/**
 * A date and time in full, for a tooltip naming one exact moment, as fine as that moment needs: a point
 * on the minute reads to the minute, and one between seconds reads to the millisecond.
 */
export function fullTimeFormat(utc: boolean): (value: number) => string {
    const timeZone = utc ? "UTC" : undefined
    const day = {year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone} as const
    const toMinute = new Intl.DateTimeFormat(undefined, day)
    const toSecond = new Intl.DateTimeFormat(undefined, {...day, second: "2-digit"})
    const toMillisecond = new Intl.DateTimeFormat(undefined, {...day, second: "2-digit", fractionalSecondDigits: 3})
    return (value) => (value % SECOND !== 0 ? toMillisecond : value % MINUTE !== 0 ? toSecond : toMinute).format(value)
}
