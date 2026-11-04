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
}

const HOUR = 3_600_000

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
    readonly #refreshMs: number
    readonly #now: () => number
    #listeners = new Set<(range: TimeRange) => void>()
    #settledListeners = new Set<(range: TimeRange) => void>()
    #settleTimer = 0
    #liveTimer = 0
    /** The cursor group of the charts on this window. A hover on one reads on them all */
    readonly syncGroup: string = `vtc-time-window-${nextWindowId++}`

    constructor(options: TimeWindowOptions = {}) {
        this.#now = options.now ?? Date.now
        this.#refreshMs = options.refreshMs ?? 5000
        this.#live = options.live ?? false
        if (options.range) {
            this.#from = Number(options.range.from)
            this.#to = Number(options.range.to)
        } else {
            this.#to = this.#now()
            this.#from = this.#to - (options.span ?? HOUR)
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
        this.#move(Math.min(a, b), Math.max(a, b), true)
    }

    /** Looks at the latest `span` milliseconds, still following the clock if it already was */
    setLast(span: number): void {
        if (!(span > 0)) {
            return
        }
        const now = this.#now()
        this.#move(now - span, now, false)
    }

    /** Moves back (`-1`) or forward (`1`) by a whole span, stopping at now when moving forward from the past */
    shift(direction: -1 | 1): void {
        const span = this.getSpan()
        this.#stopFollowing()
        const to = this.#notPastNow(this.#to + direction * span)
        this.#move(to - span, to, true)
    }

    /** Doubles the span around its middle, or by `factor`. The end stays at now rather than going past it */
    zoomOut(factor: number = 2): void {
        const span = this.getSpan() * factor
        const to = this.#notPastNow((this.#from + this.#to + span) / 2)
        if (this.#live) {
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
            const now = this.#now()
            this.#move(now - this.getSpan(), now, false)
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
    }

    /** The clock only runs while it is following and something is listening, so a page left behind costs nothing */
    #syncLiveTimer(): void {
        const needed = this.#live && (this.#listeners.size > 0 || this.#settledListeners.size > 0)
        if (needed && this.#liveTimer === 0) {
            this.#liveTimer = setInterval(() => {
                // A tab nobody is looking at catches up on the first tick after it comes back
                if (!document.hidden) {
                    const now = this.#now()
                    this.#move(now - this.getSpan(), now, false)
                }
            }, this.#refreshMs)
        } else if (!needed && this.#liveTimer !== 0) {
            clearInterval(this.#liveTimer)
            this.#liveTimer = 0
        }
    }
}
