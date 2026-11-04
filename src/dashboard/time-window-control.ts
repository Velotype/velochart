import { Component, passthroughAttrsToElement } from "../core/velotype.ts"
import type { RenderableElements, StylePassthroughAttrs } from "../core/velotype.ts"
import { mountStyles } from "../core/styles.ts"
import type { TimeWindow } from "./time-window.ts"

/** One choice in the control's list of ranges */
export type TimeWindowPresetType = {
    /** How far back it looks, in milliseconds */
    span: number
    /** Its name in the list (default: the span, worded by the browser's language) */
    label?: string
}

/** What assistive technology calls each part of the control. None has a default, so none assumes a language */
export type TimeWindowLabelsType = {
    previous?: string
    next?: string
    zoomOut?: string
    /** Also shown as text beside the live button's dot */
    live?: string
    presets?: string
    from?: string
    to?: string
}

/**
 * Attrs type for `<TimeWindowControl/>` Component
 */
export type TimeWindowControlAttrsType = {
    /** The window this controls, and that the charts on the page share */
    timeWindow: TimeWindow
    /** The ranges to offer (default: 5 and 15 minutes, 1 and 6 hours, 1 and 7 days) */
    presets?: TimeWindowPresetType[]
    /** Reads and writes the times in UTC rather than the browser's zone. Match the charts' `xAxis.utc` (default: `false`) */
    utc?: boolean
    /** Leaves out the button that follows the clock (default: `false`) */
    hideLive?: boolean
    /**
     * How finely the two times read and can be typed (default: `"auto"`). `"auto"` follows the range:
     * milliseconds under a minute, seconds under an hour, and whole minutes above that.
     */
    precision?: "auto" | "minute" | "second" | "millisecond"
    labels?: TimeWindowLabelsType
} & StylePassthroughAttrs

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const defaultPresets: TimeWindowPresetType[] = [
    {span: 5 * MINUTE}, {span: 15 * MINUTE}, {span: HOUR}, {span: 6 * HOUR}, {span: DAY}, {span: 7 * DAY},
]

/** How long a typed time waits for a pause before it applies, since each part of a date edit is a change */
const TYPING_PAUSE_MS = 250

/** A span in its largest whole-ish unit, in the browser's language */
function spanLabel(span: number): string {
    const [unit, size] = span >= DAY ? ["day", DAY] as const
        : span >= HOUR ? ["hour", HOUR] as const
        : span >= MINUTE ? ["minute", MINUTE] as const
        : span >= 1000 ? ["second", 1000] as const
        : ["millisecond", 1] as const
    return new Intl.NumberFormat(undefined, {style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1}).format(span / size)
}

function pad(value: number, length: number = 2): string {
    return String(value).padStart(length, "0")
}

let areStylesMounted = false

function mountControlStyles(): void {
    if (areStylesMounted) {
        return
    }
    areStylesMounted = true
    mountStyles(`
.vtc-time-window{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;color:var(--text);font-size:0.875rem;}
.vtc-time-window-group{display:inline-flex;flex-wrap:wrap;align-items:center;gap:0.25rem;max-width:100%;}
.vtc-time-window button,.vtc-time-window select,.vtc-time-window input{
box-sizing:border-box;
min-height:2.25rem;
padding:0.25rem 0.625rem;
font:inherit;
color:inherit;
background-color:var(--background-1);
border:1px solid var(--background-4);
border-radius:0.25rem;
}
.vtc-time-window button{cursor:pointer;min-width:2.25rem;line-height:1;}
.vtc-time-window button:hover{background-color:var(--background-2);}
.vtc-time-window button:focus-visible,.vtc-time-window select:focus-visible,.vtc-time-window input:focus-visible{outline:2px solid var(--primary-7);outline-offset:1px;}
.vtc-time-window input{font-variant-numeric:tabular-nums;min-width:0;max-width:100%;}
.vtc-time-window-live{display:inline-flex;align-items:center;gap:0.375rem;}
.vtc-time-window-dot{width:0.5rem;height:0.5rem;border-radius:50%;background-color:var(--background-6);}
.vtc-time-window-live[aria-pressed="true"]{border-color:var(--primary-7);}
.vtc-time-window-live[aria-pressed="true"] .vtc-time-window-dot{background-color:var(--primary-7);animation:vtc-time-window-pulse 2s ease-in-out infinite;}
@keyframes vtc-time-window-pulse{50%{opacity:0.35;}}
@media (prefers-reduced-motion:reduce){.vtc-time-window-live[aria-pressed="true"] .vtc-time-window-dot{animation:none;}}
@media (pointer:coarse){.vtc-time-window button,.vtc-time-window select,.vtc-time-window input{min-height:2.75rem;min-width:2.75rem;}}
`, "vtc/TimeWindowControl")
}

/**
 * The page-level control of a `TimeWindow`: back and forward, a list of ranges, the two ends as times
 * to type, zoom out, and following the clock.
 *
 * It is built from native elements and takes no state of its own beyond what the fields show, so a
 * chart dragged elsewhere on the page and this stay in step through the window.
 */
export class TimeWindowControl extends Component<TimeWindowControlAttrsType> {
    #attrs: TimeWindowControlAttrsType
    #presets: HTMLSelectElement
    /** Stands in the list for a range none of the presets is, showing its length */
    #customOption: HTMLOptionElement
    #from: HTMLInputElement
    #to: HTMLInputElement
    #live: HTMLButtonElement | undefined
    #root: HTMLDivElement
    #leave: (() => void) | undefined
    #typingTimer = 0

    constructor(attrs: TimeWindowControlAttrsType, children: RenderableElements[]) {
        super(attrs, children)
        this.#attrs = attrs
        mountControlStyles()
        const timeWindow = attrs.timeWindow
        const labels = attrs.labels ?? {}

        this.#presets = document.createElement("select")
        this.#customOption = document.createElement("option")
        this.#customOption.value = ""
        this.#customOption.disabled = true
        this.#presets.appendChild(this.#customOption)
        for (const preset of attrs.presets ?? defaultPresets) {
            const option = document.createElement("option")
            option.value = String(preset.span)
            option.textContent = preset.label ?? spanLabel(preset.span)
            this.#presets.appendChild(option)
        }
        this.#presets.addEventListener("change", () => timeWindow.setLast(Number(this.#presets.value)))
        this.#name(this.#presets, labels.presets)

        this.#from = this.#timeInput(labels.from)
        this.#to = this.#timeInput(labels.to)
        const ends = this.#group(this.#from, this.#text("–"), this.#to)

        const moving = this.#group(
            this.#button("‹", labels.previous, () => timeWindow.shift(-1)),
            this.#button("›", labels.next, () => timeWindow.shift(1)),
        )
        const zoomOut = this.#button("−", labels.zoomOut, () => timeWindow.zoomOut())

        this.#root = document.createElement("div")
        this.#root.className = "vtc-time-window"
        this.#root.setAttribute("role", "group")
        this.#root.append(moving, this.#presets, ends, zoomOut)

        if (!attrs.hideLive) {
            const live = document.createElement("button")
            live.type = "button"
            live.className = "vtc-time-window-live"
            const dot = document.createElement("span")
            dot.className = "vtc-time-window-dot"
            live.appendChild(dot)
            if (labels.live !== undefined) {
                live.append(labels.live)
            }
            live.addEventListener("click", () => timeWindow.setLive(!timeWindow.isLive()))
            this.#live = live
            this.#root.appendChild(live)
        }
        this.#show()
        passthroughAttrsToElement<HTMLDivElement>(this.#root, attrs)
    }

    override render(): HTMLDivElement {
        return this.#root
    }

    override mount(): void {
        this.#leave = this.#attrs.timeWindow.subscribe(() => this.#show())
        // It may have moved while this was off the page
        this.#show()
    }

    override unmount(): void {
        this.#leave?.()
        this.#leave = undefined
        clearTimeout(this.#typingTimer)
        this.#typingTimer = 0
    }

    #name(element: HTMLElement, label: string | undefined): void {
        if (label !== undefined) {
            element.setAttribute("aria-label", label)
            element.title = label
        }
    }

    #group(...parts: HTMLElement[]): HTMLElement {
        const group = document.createElement("span")
        group.className = "vtc-time-window-group"
        group.append(...parts)
        return group
    }

    #text(text: string): HTMLElement {
        const span = document.createElement("span")
        span.textContent = text
        span.setAttribute("aria-hidden", "true")
        return span
    }

    #button(symbol: string, label: string | undefined, onClick: () => void): HTMLButtonElement {
        const button = document.createElement("button")
        button.type = "button"
        button.textContent = symbol
        this.#name(button, label)
        button.addEventListener("click", onClick)
        return button
    }

    #timeInput(label: string | undefined): HTMLInputElement {
        const input = document.createElement("input")
        input.type = "datetime-local"
        this.#name(input, label)
        input.addEventListener("input", () => {
            clearTimeout(this.#typingTimer)
            this.#typingTimer = setTimeout(() => this.#applyTyped(), TYPING_PAUSE_MS)
        })
        // Half-typed or back to front, the field goes back to saying what is really in view
        input.addEventListener("blur", () => {
            if (this.#typingTimer === 0) {
                this.#show()
            }
        })
        return input
    }

    /** An end that makes no range yet is left alone, for the reader to finish typing */
    #applyTyped(): void {
        this.#typingTimer = 0
        const range = this.#attrs.timeWindow.getRange()
        const from = this.#typed(this.#from, range.from, range)
        const to = this.#typed(this.#to, range.to, range)
        if (from !== undefined && to !== undefined && from < to) {
            this.#attrs.timeWindow.setRange(from, to)
        }
    }

    /** What a field means: the window's own exact time if the reader hasn't changed what it says, since it may be rounded */
    #typed(input: HTMLInputElement, exact: number, range: {from: number, to: number}): number | undefined {
        // Compared as times, because a field leaves out seconds that are zero whatever it was given
        const typed = this.#parse(input.value)
        return typed === this.#parse(this.#format(exact, range.to - range.from)) ? exact : typed
    }

    /** What the fields say now, and a field in use is left to the reader */
    #show(): void {
        const timeWindow = this.#attrs.timeWindow
        const {from, to} = timeWindow.getRange()
        const span = to - from
        for (const [input, time] of [[this.#from, from], [this.#to, to]] as const) {
            if (document.activeElement !== input) {
                input.step = String(this.#precision(span) / 1000)
                input.value = this.#format(time, span)
            }
        }
        const atNow = Math.abs(to - timeWindow.now()) <= Math.max(span * 0.05, MINUTE)
        const preset = atNow ? (this.#attrs.presets ?? defaultPresets).find(candidate => Math.abs(candidate.span - span) < 1000) : undefined
        if (preset) {
            this.#customOption.hidden = true
            this.#presets.value = String(preset.span)
        } else {
            this.#customOption.hidden = false
            this.#customOption.textContent = spanLabel(span)
            this.#presets.value = ""
        }
        this.#live?.setAttribute("aria-pressed", String(timeWindow.isLive()))
        if (this.#live) {
            this.#name(this.#live, this.#attrs.labels?.live)
        }
    }

    /** How finely to read a range this long, in milliseconds */
    #precision(span: number): number {
        const precision = this.#attrs.precision ?? "auto"
        if (precision === "auto") {
            return span < MINUTE ? 1 : span < HOUR ? 1000 : MINUTE
        }
        return precision === "millisecond" ? 1 : precision === "second" ? 1000 : MINUTE
    }

    /** A moment as a `datetime-local` field holds it, to the precision of a range this long */
    #format(time: number, span: number): string {
        const date = new Date(time)
        const utc = this.#attrs.utc
        const minutes = utc
            ? `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
            : `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
        const precision = this.#precision(span)
        if (precision === MINUTE) {
            return minutes
        }
        const seconds = `${minutes}:${pad(utc ? date.getUTCSeconds() : date.getSeconds())}`
        return precision === 1000 ? seconds : `${seconds}.${pad(utc ? date.getUTCMilliseconds() : date.getMilliseconds(), 3)}`
    }

    #parse(value: string): number | undefined {
        if (value === "") {
            return undefined
        }
        const time = new Date(this.#attrs.utc ? `${value}Z` : value).getTime()
        return Number.isNaN(time) ? undefined : time
    }
}
