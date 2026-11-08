/** A range of time, in milliseconds since the epoch */
export type TimeRange = {from: number, to: number}

/** How a `TimeWindow` starts */
export type TimeWindowOptions = {
    /** Starts on the last this many milliseconds (default: one hour) */
    span?: number
    /** Starts on a fixed range instead of on the latest `span` */
    range?: {from: number | Date, to: number | Date}
    /** Starts following the clock (default: `false`) */
    live?: boolean
    /** How often a live window moves, in milliseconds (default: `5000`) */
    refreshMs?: number
    /** The clock, for anything that needs one other than the browser's (default: `Date.now`) */
    now?: () => number
    /**
     * Keeps the range in this query parameter of the page's URL, so the address can be shared: read when
     * the window is made and on going back or forward, and written once the range stops moving. It
     * replaces the current history entry rather than adding one, so moving a chart doesn't fill the back
     * button. Off unless asked for, because the URL belongs to the page.
     */
    urlParam?: string
}

/** A range as `parseTimeRange` reads it: a length back from now, or two fixed ends */
export type ParsedTimeRange = {span: number, live: boolean} | {from: number, to: number}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** What a typed unit means. `m` is minutes and `M` months, as in Grafana, and months and years are rounded to days */
const typedUnits: Record<string, number> = {
    ms: 1, s: 1000, sec: 1000, m: MINUTE, min: MINUTE, h: HOUR, hr: HOUR, d: DAY, w: 7 * DAY, M: 30 * DAY, mo: 30 * DAY, y: 365 * DAY,
}

/** One end of a fixed range: an ISO 8601 date, or milliseconds since the epoch */
function parseEnd(text: string): number | undefined {
    if (/^\d{10,}$/.test(text)) {
        return Number(text)
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(text)) {
        return undefined
    }
    const time = Date.parse(text)
    return Number.isNaN(time) ? undefined : time
}

/**
 * Reads a range: `13h` or `now-13h` for a length back from now, `live-13h` for one following the clock,
 * `start/end` for two fixed ends, or a whole URL holding one of those in its query.
 */
export function parseTimeRange(text: string, urlParam?: string): ParsedTimeRange | undefined {
    const trimmed = text.trim()
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("?")) {
        let params: URLSearchParams
        try {
            params = trimmed.startsWith("?") ? new URLSearchParams(trimmed) : new URL(trimmed).searchParams
        } catch {
            return undefined
        }
        // Its own name first, then anything else that reads as a range, since a link may be from a page naming it differently
        const named = urlParam !== undefined ? params.get(urlParam) : null
        const values: string[] = named !== null ? [named] : []
        // forEach rather than values(): every DOM typing an app may compile this under has it
        params.forEach(value => values.push(value))
        for (const value of values) {
            const parsed = parseTimeRange(value)
            if (parsed) {
                return parsed
            }
        }
        return undefined
    }
    const relative = trimmed.match(/^(?:(now|live)\s*-\s*)?(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/)
    if (relative) {
        const size = typedUnits[relative[3]] ?? typedUnits[relative[3].toLowerCase()]
        const span = Number(relative[2]) * size
        return span > 0 ? {span, live: relative[1] === "live"} : undefined
    }
    const ends = trimmed.split("/")
    if (ends.length === 2) {
        const from = parseEnd(ends[0].trim())
        const to = parseEnd(ends[1].trim())
        return from !== undefined && to !== undefined && from < to ? {from, to} : undefined
    }
    return undefined
}

/** A length as `parseTimeRange` reads it, in the largest unit that holds it exactly */
function shorthand(span: number): string {
    for (const [unit, size] of [["d", DAY], ["h", HOUR], ["m", MINUTE], ["s", 1000]] as const) {
        if (span >= size && span % size === 0) {
            return `${span / size}${unit}`
        }
    }
    return `${span}ms`
}

/** How long a settled listener waits for the changes to stop, in milliseconds */
const SETTLE_MS = 250

let nextWindowId = 0

/**
 * The time range a page is looking at, shared by every chart on it.
 *
 * It holds no reference to any chart: a chart given it as `timeWindow` subscribes when it mounts and
 * leaves when it unmounts, so nothing has to be wired together, and a chart gone from the page is
 * never held on to. Anything else that follows the range, a gauge or a query, subscribes the same way.
 *
 * Moving it is the one way to move the range. A chart dragged, zoomed or panned by a reader calls
 * `setRange` here and redraws when told to, so no chart's view can disagree with another's.
 */
export class TimeWindow {
    #from: number
    #to: number
    #live: boolean
    /** Whether the range is a length back from now rather than two fixed ends */
    #relative: boolean
    readonly #refreshMs: number
    readonly #now: () => number
    #listeners = new Set<(range: TimeRange) => void>()
    #settledListeners = new Set<(range: TimeRange) => void>()
    #settleTimer: ReturnType<typeof setTimeout> | 0 = 0
    #liveTimer: ReturnType<typeof setInterval> | 0 = 0
    /** When the clock next moves a live window, in the browser's time */
    #nextTick: number | undefined
    readonly #urlParam: string | undefined
    #urlTimer: ReturnType<typeof setTimeout> | 0 = 0
    #watchingUrl = false
    /** The cursor group of the charts on this window. A hover on one reads on them all */
    readonly syncGroup: string = `vtc-time-window-${nextWindowId++}`

    constructor(options: TimeWindowOptions = {}) {
        this.#now = options.now ?? Date.now
        this.#refreshMs = options.refreshMs ?? 5000
        this.#live = options.live ?? false
        this.#urlParam = options.urlParam
        this.#relative = this.#live || !options.range
        if (options.range) {
            this.#from = Number(options.range.from)
            this.#to = Number(options.range.to)
        } else {
            this.#to = this.#now()
            this.#from = this.#to - (options.span ?? HOUR)
        }
        const fromUrl = this.#readUrl()
        if (fromUrl) {
            this.#adopt(fromUrl)
        }
    }

    /** The range in view */
    getRange(): TimeRange {
        return {from: this.#from, to: this.#to}
    }

    /** How long the range in view is, in milliseconds */
    getSpan(): number {
        return this.#to - this.#from
    }

    /** Whether the range is following the clock */
    isLive(): boolean {
        return this.#live
    }

    /** How often a live window moves, in milliseconds */
    getRefreshMs(): number {
        return this.#refreshMs
    }

    /** When the clock next moves a live window, as `Date.now()` would say it, or `undefined` while it isn't running */
    getNextTick(): number | undefined {
        return this.#nextTick
    }

    /**
     * Whether the range is the latest so-long, rather than two fixed times. A range left standing stops
     * being that once it is noticeably behind now, since it no longer shows the latest of anything.
     */
    isRelative(): boolean {
        if (!this.#relative) {
            return false
        }
        return this.#live || Math.abs(this.#to - this.#now()) <= Math.max(this.getSpan() * 0.05, MINUTE)
    }

    /** The range as text to copy or put in a link: `now-6h`, `live-6h`, or `start/end` in ISO 8601 */
    toText(): string {
        if (this.isRelative()) {
            return `${this.#live ? "live" : "now"}-${shorthand(this.getSpan())}`
        }
        return `${new Date(this.#from).toISOString()}/${new Date(this.#to).toISOString()}`
    }

    /** Looks at a range given as text, in any form `toText` writes, or a URL holding one. Says whether it could */
    setFromText(text: string): boolean {
        const parsed = parseTimeRange(text, this.#urlParam)
        if (parsed) {
            this.#apply(parsed)
        }
        return parsed !== undefined
    }

    /** The current time on this window's clock */
    now(): number {
        return this.#now()
    }

    /** Whether a moment is in the range, for filtering what a panel without a time axis shows */
    contains(time: number | Date): boolean {
        const value = Number(time)
        return value >= this.#from && value <= this.#to
    }

    /** Looks at a fixed range. A reader choosing one stops following the clock, so this does too */
    setRange(from: number | Date, to: number | Date): void {
        const a = Number(from)
        const b = Number(to)
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
            return
        }
        this.#stopFollowing()
        this.#relative = false
        this.#move(Math.min(a, b), Math.max(a, b), true)
    }

    /** Looks at the latest `span` milliseconds, still following the clock if it already was */
    setLast(span: number): void {
        if (!(span > 0)) {
            return
        }
        const now = this.#now()
        this.#relative = true
        this.#move(now - span, now, true)
    }

    /** Moves back (`-1`) or forward (`1`) by a whole span, stopping at now when moving forward from the past */
    shift(direction: -1 | 1): void {
        const span = this.getSpan()
        this.#stopFollowing()
        this.#relative = false
        const to = this.#notPastNow(this.#to + direction * span)
        this.#move(to - span, to, true)
    }

    /** Doubles the span around its middle, or by `factor`. The end stays at now rather than going past it */
    zoomOut(factor: number = 2): void {
        const span = this.getSpan() * factor
        const to = this.#notPastNow((this.#from + this.#to + span) / 2)
        if (this.isRelative()) {
            this.#move(this.#now() - span, this.#now(), false)
        } else {
            this.#move(to - span, to, true)
        }
    }

    /** Starts or stops following the clock. Starting moves straight to now, keeping the span */
    setLive(live: boolean): void {
        if (live === this.#live) {
            return
        }
        this.#live = live
        this.#syncLiveTimer()
        if (live) {
            this.#relative = true
            const now = this.#now()
            this.#move(now - this.getSpan(), now, true)
        } else {
            this.#emit(false)
        }
    }

    /**
     * Calls `listener` on every change, at up to display rate during a drag, including a change of
     * `isLive()` alone. For redrawing. Returns the way to stop.
     */
    subscribe(listener: (range: TimeRange) => void): () => void {
        this.#listeners.add(listener)
        this.#syncLiveTimer()
        return () => {
            this.#listeners.delete(listener)
            this.#syncLiveTimer()
        }
    }

    /**
     * Calls `listener` once the range has stopped changing, so a drag across a chart costs one query
     * rather than hundreds. For fetching. Returns the way to stop.
     */
    subscribeSettled(listener: (range: TimeRange) => void): () => void {
        this.#settledListeners.add(listener)
        this.#syncLiveTimer()
        return () => {
            this.#settledListeners.delete(listener)
            if (this.#settledListeners.size === 0) {
                clearTimeout(this.#settleTimer)
                this.#settleTimer = 0
            }
            this.#syncLiveTimer()
        }
    }

    #apply(parsed: ParsedTimeRange): void {
        if ("span" in parsed) {
            this.setLast(parsed.span)
            this.setLive(parsed.live)
        } else {
            this.setRange(parsed.from, parsed.to)
        }
    }

    /** Takes on a range before anything is listening, so with nothing to tell and no timer to start */
    #adopt(parsed: ParsedTimeRange): void {
        if ("span" in parsed) {
            this.#live = parsed.live
            this.#relative = true
            this.#to = this.#now()
            this.#from = this.#to - parsed.span
        } else {
            this.#live = false
            this.#relative = false
            this.#from = parsed.from
            this.#to = parsed.to
        }
    }

    #readUrl(): ParsedTimeRange | undefined {
        if (this.#urlParam === undefined) {
            return undefined
        }
        const value = new URLSearchParams(location.search).get(this.#urlParam)
        return value === null ? undefined : parseTimeRange(value)
    }

    /** Back or forward to an address saying something else */
    #onPopState = () => {
        const parsed = this.#readUrl()
        if (parsed) {
            this.#apply(parsed)
        }
    }

    /** Keeps what the address says readable: a colon and a slash are both allowed in a query as they are */
    #writeUrl(): void {
        const param = this.#urlParam as string
        const text = this.toText()
        const url = new URL(location.href)
        if (url.searchParams.get(param) === text) {
            return
        }
        url.searchParams.set(param, text)
        const search = url.search.replace(`${encodeURIComponent(param)}=${encodeURIComponent(text)}`, `${encodeURIComponent(param)}=${text}`)
        history.replaceState(history.state, "", `${url.pathname}${search}${url.hash}`)
    }

    #stopFollowing(): void {
        if (this.#live) {
            this.#live = false
            this.#syncLiveTimer()
        }
    }

    /** A range already past now, as a forecast may be, is left there: only crossing now is stopped */
    #notPastNow(to: number): number {
        const now = this.#now()
        return this.#to <= now ? Math.min(to, now) : to
    }

    /** `announceAnyway` is for a change of `isLive()`, which has to be told even with the range unmoved */
    #move(from: number, to: number, announceAnyway: boolean): void {
        const moved = from !== this.#from || to !== this.#to
        this.#from = from
        this.#to = to
        if (moved) {
            this.#emit(true)
        } else if (announceAnyway) {
            this.#emit(false)
        }
    }

    #emit(moved: boolean): void {
        const range = this.getRange()
        // A copy, because a listener may leave while being told
        for (const listener of [...this.#listeners]) {
            listener(range)
        }
        if (moved && this.#settledListeners.size > 0) {
            clearTimeout(this.#settleTimer)
            this.#settleTimer = setTimeout(() => {
                this.#settleTimer = 0
                const settled = this.getRange()
                for (const listener of [...this.#settledListeners]) {
                    listener(settled)
                }
            }, SETTLE_MS)
        }
        // Waits for a pause, because browsers limit how often a page may change its address
        if (this.#urlParam !== undefined && this.#hasListeners()) {
            clearTimeout(this.#urlTimer)
            this.#urlTimer = setTimeout(() => {
                this.#urlTimer = 0
                this.#writeUrl()
            }, SETTLE_MS)
        }
    }

    #hasListeners(): boolean {
        return this.#listeners.size > 0 || this.#settledListeners.size > 0
    }

    /**
     * The clock only runs while it is following and something is listening, so a page left behind costs
     * nothing. The address is only touched while something is listening too, or a window left behind by
     * an in-page navigation would write itself into the next page's URL.
     */
    #syncLiveTimer(): void {
        const listening = this.#hasListeners()
        if (this.#urlParam !== undefined && listening !== this.#watchingUrl) {
            this.#watchingUrl = listening
            if (listening) {
                addEventListener("popstate", this.#onPopState)
            } else {
                removeEventListener("popstate", this.#onPopState)
                clearTimeout(this.#urlTimer)
                this.#urlTimer = 0
            }
        }
        const needed = this.#live && listening
        if (needed && this.#liveTimer === 0) {
            this.#nextTick = Date.now() + this.#refreshMs
            this.#liveTimer = setInterval(() => {
                this.#nextTick = Date.now() + this.#refreshMs
                // A tab nobody is looking at catches up on the first tick after it comes back
                if (!document.hidden) {
                    const now = this.#now()
                    this.#move(now - this.getSpan(), now, false)
                }
            }, this.#refreshMs)
        } else if (!needed && this.#liveTimer !== 0) {
            clearInterval(this.#liveTimer)
            this.#liveTimer = 0
            this.#nextTick = undefined
        }
    }
}
