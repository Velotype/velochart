/** @jsxRuntime classic */
/** @jsx h */
import { h } from "../core/jsx.ts"
import { Component, getComponent, passthroughAttrsToElement } from "../core/velotype.ts"
import type { RenderableElements, StylePassthroughAttrs } from "../core/velotype.ts"
import { Button, ButtonGroup, DateTimePicker, FormField, Glyphs, Grid, I, Icon, Popover, Stack, Text, TextBox } from "../core/velodesign.ts"
import { mountStyles } from "../core/styles.ts"
import { svgEl } from "../core/chart-common.ts"
import { fullTimeFormat } from "../core/scale.ts"
import { parseTimeRange } from "./time-window.ts"
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
    /** The button showing the range, and what opens from it */
    range?: string
    /** The box for typing a range such as `13h`. Its placeholder shows the syntax, so this isn't shown */
    filter?: string
    /** Copies the range as text */
    copy?: string
    /** Takes a range from the clipboard */
    paste?: string
    /** These two are also shown above their fields */
    from?: string
    to?: string
}

/**
 * Attrs type for `<TimeWindowControl/>` Component
 */
export type TimeWindowControlAttrsType = {
    /** The window this controls, and that the charts on the page share */
    timeWindow: TimeWindow
    /** The ranges to offer (default: 5 and 15 minutes, 1, 6 and 12 hours, 1, 7 and 30 days) */
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
    /**
     * Which way what opens from the range runs (default: `"auto"`). `"auto"` runs into the page, so
     * leftward from a control on the right of it. Whichever this is, it stays on the page.
     */
    opens?: "auto" | "leftward" | "rightward"
    labels?: TimeWindowLabelsType
} & StylePassthroughAttrs

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const defaultPresets: TimeWindowPresetType[] = [
    {span: 5 * MINUTE}, {span: 15 * MINUTE}, {span: HOUR}, {span: 6 * HOUR}, {span: 12 * HOUR}, {span: DAY}, {span: 7 * DAY}, {span: 30 * DAY},
]

/** How long a typed time waits for a pause before it applies, since each part of a date edit is a change */
const TYPING_PAUSE_MS = 250

/** How long the copy button shows that it worked */
const COPIED_MS = 1500

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

/**
 * The control's icons: velodesign's reviewed glyphs where one fits, and line drawings in the same style
 * (a 24-unit box, round ends, a 2-unit line) for the three it has none for
 */
const ICONS = {
    clock: new Icon(24, 24, "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 1 1 17 0zM12 7.5V12l3 2", 2),
    // The back sheet is only its top-right corner, the part the front sheet leaves showing
    copy: new Icon(24, 24, "M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM7.5 3H19a2 2 0 0 1 2 2v11.5", 2),
    paste: new Icon(24, 24, "M8.5 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1.5M9.5 3h5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 12h6M9 16h4", 2),
    copied: Glyphs.tick,
    open: Glyphs.chevronDown,
    earlier: Glyphs.chevronLeft,
    later: Glyphs.chevronRight,
    zoomOut: Glyphs.zoomOut,
}

/** An icon that decorates what names it: with no label, velodesign hides it from assistive technology */
function icon(key: keyof typeof ICONS): HTMLElement {
    return <I icon={ICONS[key]}/> as unknown as HTMLElement
}

let areStylesMounted = false

function mountControlStyles(): void {
    if (areStylesMounted) {
        return
    }
    areStylesMounted = true
    mountStyles(
/* velodesign's parts, at the size a toolbar wants them. Its layer always loses to this one */
`
.vtc-time-window{color:var(--text);font-size:0.8125rem;max-width:100%;}
.vtc-time-window .vtd-icon{flex:none;width:1rem;height:1rem;}
.vtc-time-window .vtd-button{
box-sizing:border-box;
min-height:1.875rem;
padding:0.125rem 0.3125rem;
font:inherit;
color:inherit;
white-space:nowrap;
background-color:var(--background-1);
border:1px solid var(--background-4);
}
.vtc-time-window .vtd-button:hover{background-color:var(--background-2);border:1px solid var(--background-4);}
.vtc-time-window .vtd-button>span{display:inline-flex;align-items:center;justify-content:center;gap:0.375rem;}
.vtc-time-window .vtd-button:focus-visible{outline:2px solid var(--primary-7);outline-offset:1px;}
.vtc-time-window .vtd-button-group{min-width:0;max-width:100%;}
` +
/* ButtonGroup joins the buttons it can see as its own children, and the range is one level further down */
`
.vtc-time-window .vtd-popover{min-width:0;}
.vtc-time-window .vtd-popover-trigger{display:inline-flex;max-width:100%;}
.vtc-time-window .vtd-popover-trigger>.vtd-button{border-radius:0;margin-inline-start:-1px;min-width:0;padding-inline:0.5rem;}
.vtc-time-window-range>span{min-width:0;font-variant-numeric:tabular-nums;}
.vtc-time-window-range-text{overflow:hidden;text-overflow:ellipsis;}
.vtc-time-window-zone{font-size:0.85em;}
.vtc-time-window .vtc-time-window-live{padding-inline:0.5rem;}
.vtc-time-window-beat{position:relative;display:inline-flex;align-items:center;justify-content:center;width:0.875rem;height:0.875rem;flex:none;}
.vtc-time-window-dot{width:0.5rem;height:0.5rem;border-radius:50%;background-color:var(--background-6);}
` +
/* Fills once between one move of the window and the next. Standing full, with no animation, says only that it is on */
`
.vtc-time-window-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);fill:none;stroke:var(--primary-7);stroke-width:2;visibility:hidden;}
.vtc-time-window-ring circle{stroke-dasharray:1;stroke-dashoffset:0;}
.vtc-time-window-every{display:none;}
.vtc-time-window .vtc-time-window-live[aria-pressed="true"]{border-color:var(--primary-7);}
.vtc-time-window-live[aria-pressed="true"] .vtc-time-window-dot{width:0.3125rem;height:0.3125rem;background-color:var(--primary-7);}
.vtc-time-window-live[aria-pressed="true"] .vtc-time-window-ring{visibility:visible;}
.vtc-time-window-live[aria-pressed="true"] .vtc-time-window-every{display:inline;}
` +
/* Popover's bubble is sized for a sentence, and this one holds a small form */
`
.vtc-time-window .vtd-popover-content{
box-sizing:border-box;
width:min(27rem,calc(100vw - 1rem));
max-width:none;
padding:0.625rem;
overflow-y:auto;
white-space:normal;
}
.vtc-time-window-popover .vtd-button{border-radius:0.25rem;margin-inline-start:0;}
.vtc-time-window-entry{grid-column:1/-1;}
.vtc-time-window .vtc-time-window-filter{flex:1;min-width:0;box-sizing:border-box;min-height:1.875rem;font:inherit;}
.vtc-time-window-filter[aria-invalid="true"]{border-color:var(--warning);}
.vtc-time-window-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(5.5rem,1fr));gap:1px;align-content:start;}
.vtc-time-window .vtc-time-window-list .vtd-button{display:block;text-align:start;width:100%;padding-inline:0.5rem;background-color:transparent;border-color:transparent;}
.vtc-time-window .vtc-time-window-list .vtd-button:hover{background-color:var(--background-2);border-color:transparent;}
.vtc-time-window .vtc-time-window-list .vtd-button[aria-current="true"]{background-color:var(--background-3);font-weight:600;}
.vtc-time-window .vtc-time-window-list .vtd-button>span{justify-content:flex-start;}
.vtc-time-window .vtc-time-window-list .vtd-button[hidden]{display:none;}
.vtc-time-window-ends{min-width:0;}
.vtc-time-window-end{gap:0.125rem;}
.vtc-time-window .vtc-time-window-end .vtd-form-field-label{font-weight:normal;font-size:1em;color:var(--background-8);}
.vtc-time-window .vtc-time-window-end input{box-sizing:border-box;width:100%;min-height:1.875rem;font:inherit;font-variant-numeric:tabular-nums;}
@media (pointer:coarse){.vtc-time-window .vtd-button,.vtc-time-window input{min-height:2.75rem;min-width:2.75rem;}}
`, "vtc/TimeWindowControl")
}

/**
 * The page-level control of a `TimeWindow`, as Grafana and Datadog have it: the range in one line of
 * text, and everything else in what opens from it. It usually sits flush right at the top of the page,
 * which `style={{justifyContent: "flex-end"}}` does, since it is as wide as what holds it.
 *
 * It is made of velodesign's components, down to its text and layout, so it looks and behaves like the rest of a page using them, and `Popover` keeps what opens in view. It takes
 * no state of its own beyond what the fields show, so a chart dragged elsewhere on the page and this
 * stay in step through the window.
 */
export class TimeWindowControl extends Component<TimeWindowControlAttrsType> {
    #attrs: TimeWindowControlAttrsType
    #presets: TimeWindowPresetType[]
    #popover: Popover
    #range: HTMLButtonElement
    #rangeText: HTMLSpanElement
    #filter: HTMLInputElement
    #list: HTMLDivElement
    #presetButtons: {preset: TimeWindowPresetType, button: HTMLButtonElement, label: string}[] = []
    /** Stands in the list for a range typed into the filter that no preset is */
    #typedButton: HTMLButtonElement
    #copyIcon: HTMLSpanElement
    #copiedTimer: ReturnType<typeof setTimeout> | 0 = 0
    #ring: SVGElement | undefined
    #ringAnimation: Animation | undefined
    /** Which tick the ring is counting down to, so a change that isn't one leaves it running */
    #ringTick: number | undefined
    #from: HTMLInputElement
    #to: HTMLInputElement
    #live: HTMLButtonElement | undefined
    #root: HTMLDivElement
    #leave: (() => void) | undefined
    #typingTimer: ReturnType<typeof setTimeout> | 0 = 0
    /** Built once per precision and year, since a drag across a chart asks for this at display rate */
    #formatters = new Map<string, Intl.DateTimeFormat>()

    constructor(attrs: TimeWindowControlAttrsType, children: RenderableElements[]) {
        super(attrs, children)
        this.#attrs = attrs
        this.#presets = attrs.presets ?? defaultPresets
        mountControlStyles()
        const timeWindow = attrs.timeWindow
        const labels = attrs.labels ?? {}

        this.#rangeText = <Text class="vtc-time-window-range-text" numeric/> as HTMLSpanElement
        this.#range = <Button type="text" class="vtc-time-window-range">
            {icon("clock")}
            {this.#rangeText}
            {attrs.utc ? <Text type="muted" class="vtc-time-window-zone">UTC</Text> : null}
            {icon("open")}
        </Button> as HTMLButtonElement
        this.#range.setAttribute("aria-haspopup", "dialog")
        this.#range.setAttribute("aria-expanded", "false")

        this.#filter = <TextBox type="text" class="vtc-time-window-filter" placeholder="15m  2h  7d  now-30d" ariaLabel={labels.filter} onInput={() => this.#showFilter()}/> as HTMLInputElement
        this.#filter.autocomplete = "off"
        this.#filter.spellcheck = false
        this.#filter.addEventListener("keydown", (event) => this.#onFilterKey(event))
        // A whole range pasted in is plainly meant, so it needs no Enter. Anything else is left as ordinary typing
        this.#filter.addEventListener("paste", (event) => {
            if (timeWindow.setFromText(event.clipboardData?.getData("text") ?? "")) {
                event.preventDefault()
                this.#closeToRange()
            }
        })
        this.#copyIcon = <span>{icon("copy")}</span> as HTMLSpanElement

        this.#typedButton = <Button type="text" onClick={() => this.#applyFilter()}/> as HTMLButtonElement
        this.#typedButton.hidden = true
        this.#list = <div class="vtc-time-window-list" onKeyDown={(event: KeyboardEvent) => this.#onListKey(event)}>{this.#typedButton}</div> as HTMLDivElement
        for (const preset of this.#presets) {
            const label = preset.label ?? spanLabel(preset.span)
            const button = <Button type="text" onClick={() => this.#pick(preset.span)}>{label}</Button> as HTMLButtonElement
            button.dataset.span = String(preset.span)
            this.#presetButtons.push({preset, button, label})
            this.#list.appendChild(button)
        }

        this.#from = this.#timeInput(labels.from)
        this.#to = this.#timeInput(labels.to)

        const body = <Grid minColumnWidth="11rem" gap="0.5rem 0.75rem" class="vtc-time-window-popover">
            <Stack gap="0.25rem" wrap={false} class="vtc-time-window-entry">
                {this.#filter}
                {this.#square(<Button type="text" ariaLabel={labels.copy} onClick={() => this.#copyRange()}>{this.#copyIcon}</Button>, labels.copy)}
                {this.#square(<Button type="text" ariaLabel={labels.paste} onClick={() => this.#pasteRange()}>{icon("paste")}</Button>, labels.paste)}
            </Stack>
            {this.#list}
            <Stack direction="column" gap="0.5rem" class="vtc-time-window-ends">
                <FormField label={labels.from} class="vtc-time-window-end">{this.#from}</FormField>
                <FormField label={labels.to} class="vtc-time-window-end">{this.#to}</FormField>
            </Stack>
        </Grid> as HTMLElement
        body.setAttribute("role", "dialog")
        if (labels.range !== undefined) {
            body.setAttribute("aria-label", labels.range)
        }

        const opens = attrs.opens ?? "auto"
        this.#popover = getComponent<Popover>(<Popover
            align={opens === "auto" ? "auto" : opens === "leftward" ? "end" : "start"}
            scrolls
            onOpen={() => this.#onOpen()}
            onClose={() => this.#onClose()}
            trigger={this.#range}
            content={body}/>)

        this.#root = <Stack align="center" gap="0.375rem" class="vtc-time-window">
            <ButtonGroup>
                {this.#square(<Button type="text" ariaLabel={labels.previous} onClick={() => timeWindow.shift(-1)}>{icon("earlier")}</Button>, labels.previous)}
                {this.#popover}
                {this.#square(<Button type="text" ariaLabel={labels.next} onClick={() => timeWindow.shift(1)}>{icon("later")}</Button>, labels.next)}
            </ButtonGroup>
            {this.#square(<Button type="text" ariaLabel={labels.zoomOut} onClick={() => timeWindow.zoomOut()}>{icon("zoomOut")}</Button>, labels.zoomOut)}
            {attrs.hideLive ? null : this.#liveButton(labels.live)}
        </Stack> as HTMLDivElement
        this.#root.setAttribute("role", "group")
        // Moving on from it by keyboard is leaving it, just as a click elsewhere is
        this.#root.addEventListener("focusout", (event) => {
            // Null when the window itself lost focus, which isn't the reader moving on
            const next = event.relatedTarget as Node | null
            if (next && !this.#root.contains(next)) {
                this.#popover.close()
            }
        })
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
        clearTimeout(this.#copiedTimer)
        this.#stopRing()
        this.#popover.close()
    }

    /** An icon-only button carries its name as a hover hint too, which a name given as `ariaLabel` alone doesn't */
    #square(button: RenderableElements, label?: string): HTMLElement {
        const element = button as HTMLElement
        if (label !== undefined) {
            element.title = label
        }
        return element
    }

    #liveButton(label: string | undefined): HTMLButtonElement {
        const timeWindow = this.#attrs.timeWindow
        this.#ring = svgEl("svg", {class: "vtc-time-window-ring", viewBox: "0 0 14 14", "aria-hidden": "true"})
        this.#ring.appendChild(svgEl("circle", {cx: 7, cy: 7, r: 6, pathLength: 1}))
        this.#live = <Button type="text" class="vtc-time-window-live" onClick={() => timeWindow.setLive(!timeWindow.isLive())}>
            <span class="vtc-time-window-beat">
                {this.#ring}
                <span class="vtc-time-window-dot"/>
            </span>
            {label ?? null}
            {/* How often in words too, since a ring going round every second is hard to read as a length */}
            <Text type="muted" numeric class="vtc-time-window-every">{spanLabel(timeWindow.getRefreshMs())}</Text>
        </Button> as HTMLButtonElement
        return this.#live
    }

    #onOpen(): void {
        this.#filter.value = ""
        this.#showFilter()
        this.#show()
        this.#range.setAttribute("aria-expanded", "true")
        // A phone would bring its keyboard up over the list for a reader who only wants to tap a range
        if (!matchMedia("(pointer:coarse)").matches) {
            this.#filter.focus()
        }
    }

    #onClose(): void {
        this.#range.setAttribute("aria-expanded", "false")
        this.#show()
    }

    /** Finished with what opened, so back to what opened it, whatever had focus before */
    #closeToRange(): void {
        this.#popover.close()
        this.#range.focus()
    }

    #pick(span: number): void {
        this.#attrs.timeWindow.setLast(span)
        this.#closeToRange()
    }

    /** Applies what is in the box, or says it can't */
    #applyFilter(): boolean {
        if (this.#attrs.timeWindow.setFromText(this.#filter.value)) {
            this.#closeToRange()
            return true
        }
        this.#filter.setAttribute("aria-invalid", "true")
        return false
    }

    /** Narrows the list to what is typed, and offers a range the list doesn't have */
    #showFilter(): void {
        const text = this.#filter.value.trim().toLowerCase()
        const typed = parseTimeRange(this.#filter.value)
        const typedSpan = typed && "span" in typed ? typed.span : undefined
        const exact = this.#presetButtons.find(entry => entry.preset.span === typedSpan)
        for (const entry of this.#presetButtons) {
            entry.button.hidden = text !== "" && entry !== exact && !entry.label.toLowerCase().includes(text)
        }
        this.#typedButton.hidden = typed === undefined || exact !== undefined
        if (typed) {
            const words = "span" in typed ? spanLabel(typed.span) : this.#formatRange(typed.from, typed.to, typed.to - typed.from)
            this.#typedButton.replaceChildren(words)
        }
        this.#filter.removeAttribute("aria-invalid")
    }

    #onFilterKey(event: KeyboardEvent): void {
        if (event.key === "Enter") {
            event.preventDefault()
            const value = this.#filter.value.trim()
            if (value === "") {
                return
            }
            const first = this.#presetButtons.find(entry => !entry.button.hidden)
            if (parseTimeRange(value) || !first) {
                this.#applyFilter()
            } else {
                this.#pick(first.preset.span)
            }
        } else if (event.key === "ArrowDown") {
            event.preventDefault()
            this.#visibleInList()[0]?.focus()
        }
    }

    /** Copies the range, or where the browser won't, leaves it selected in the box for the reader to copy */
    async #copyRange(): Promise<void> {
        const text = this.#attrs.timeWindow.toText()
        try {
            await navigator.clipboard.writeText(text)
        } catch {
            this.#filter.value = text
            this.#showFilter()
            this.#filter.focus()
            this.#filter.select()
            return
        }
        this.#copyIcon.replaceChildren(icon("copied"))
        clearTimeout(this.#copiedTimer)
        this.#copiedTimer = setTimeout(() => this.#copyIcon.replaceChildren(icon("copy")), COPIED_MS)
    }

    /** Takes the range from the clipboard, or where the browser won't, puts the reader in the box to paste it */
    async #pasteRange(): Promise<void> {
        let text: string
        try {
            text = await navigator.clipboard.readText() // baseline-ok: without it the reader pastes into the box, which needs no permission
        } catch {
            this.#filter.focus()
            return
        }
        this.#filter.value = text.trim()
        this.#showFilter()
        this.#applyFilter()
    }

    #onListKey(event: KeyboardEvent): void {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
            return
        }
        event.preventDefault()
        const visible = this.#visibleInList()
        const index = visible.indexOf(document.activeElement as HTMLButtonElement)
        const next = index + (event.key === "ArrowDown" ? 1 : -1)
        if (next < 0) {
            this.#filter.focus()
        } else {
            visible[Math.min(next, visible.length - 1)]?.focus()
        }
    }

    #visibleInList(): HTMLButtonElement[] {
        return Array.from(this.#list.children).filter(button => !(button as HTMLElement).hidden) as HTMLButtonElement[]
    }

    #timeInput(label: string | undefined): HTMLInputElement {
        const input = <DateTimePicker onInput={() => {
            clearTimeout(this.#typingTimer)
            this.#typingTimer = setTimeout(() => this.#applyTyped(), TYPING_PAUSE_MS)
        }}/> as HTMLInputElement
        if (label !== undefined) {
            input.setAttribute("aria-label", label)
        }
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

    /** What the control says now, and a field in use is left to the reader */
    #show(): void {
        const timeWindow = this.#attrs.timeWindow
        const {from, to} = timeWindow.getRange()
        const span = to - from
        const relative = timeWindow.isRelative()
        const preset = relative ? this.#presets.find(candidate => Math.abs(candidate.span - span) < 1000) : undefined
        this.#rangeText.textContent = relative ? preset?.label ?? spanLabel(span) : this.#formatRange(from, to, span)

        const exact = fullTimeFormat(this.#attrs.utc ?? false)
        this.#range.title = `${exact(from)} – ${exact(to)}`
        const name = this.#attrs.labels?.range
        if (name !== undefined) {
            this.#range.setAttribute("aria-label", `${name}: ${this.#rangeText.textContent}`)
        }
        if (!this.#popover.isOpen()) {
            for (const entry of this.#presetButtons) {
                entry.button.setAttribute("aria-current", String(entry.preset === preset))
            }
        }
        for (const [input, time] of [[this.#from, from], [this.#to, to]] as const) {
            if (document.activeElement !== input) {
                input.step = String(this.#precision(span) / 1000)
                input.value = this.#format(time, span)
            }
        }
        if (this.#live) {
            const live = timeWindow.isLive()
            this.#live.setAttribute("aria-pressed", String(live))
            const liveName = this.#attrs.labels?.live
            if (liveName !== undefined) {
                const named = live ? `${liveName}, ${spanLabel(timeWindow.getRefreshMs())}` : liveName
                this.#live.setAttribute("aria-label", named)
                this.#live.title = named
            }
            this.#syncRing()
        }
    }

    /** Runs the ring to the window's next move, picking up part way if that is already under way */
    #syncRing(): void {
        const next = this.#attrs.timeWindow.getNextTick()
        if (next === undefined) {
            this.#stopRing()
            return
        }
        const circle = this.#ring?.firstElementChild
        if (next === this.#ringTick || !circle || matchMedia("(prefers-reduced-motion:reduce)").matches) {
            return
        }
        this.#ringAnimation?.cancel()
        this.#ringTick = next
        const duration = this.#attrs.timeWindow.getRefreshMs()
        // Held at full if a tick is late, as in a tab just brought back, rather than dropping to empty early
        this.#ringAnimation = circle.animate([{strokeDashoffset: 1}, {strokeDashoffset: 0}], {duration, fill: "forwards"})
        this.#ringAnimation.currentTime = Math.max(0, duration - (next - Date.now()))
    }

    #stopRing(): void {
        this.#ringAnimation?.cancel()
        this.#ringAnimation = undefined
        this.#ringTick = undefined
    }

    /** A fixed range as short as it can be read, with what the two ends share said once */
    #formatRange(from: number, to: number, span: number): string {
        const precision = this.#precision(span)
        const thisYear = new Date(this.#attrs.timeWindow.now()).getFullYear() === new Date(from).getFullYear()
        const key = `${precision}/${thisYear}`
        let formatter = this.#formatters.get(key)
        if (!formatter) {
            formatter = new Intl.DateTimeFormat(undefined, {
                year: thisYear ? undefined : "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                second: precision < MINUTE ? "2-digit" : undefined,
                fractionalSecondDigits: precision === 1 ? 3 : undefined,
                timeZone: this.#attrs.utc ? "UTC" : undefined,
            })
            this.#formatters.set(key, formatter)
        }
        return formatter.formatRange(from, to)
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
