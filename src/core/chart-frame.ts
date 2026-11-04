import { Component, passthroughAttrsToElement } from "./velotype.ts"
import type { RenderableElements } from "./velotype.ts"
import {
    buildLegend, ChartThemeOptions, ChartTooltip, mountChartStyles, svgEl
} from "./chart-common.ts"
import { saveFile, standaloneSvg, svgToPng, tableToCsv } from "./export.ts"
import { patternDash, patternFill, patternSwatch } from "./patterns.ts"
import type { ChartBaseAttrsType, ChartDataTable, ChartPointDetail, TooltipAnchor, TooltipRow } from "./chart-common.ts"

let nextChartId = 0

/** Something drawn that a reader can point at: what its tooltip says, and where it goes */
export type ChartMark = {
    title: string
    rows: TooltipRow[]
    anchor: TooltipAnchor
    detail?: ChartPointDetail
}

/**
 * The container every chart draws into: sizing, redraw-on-resize, tooltip, legend, empty state.
 *
 * **Why a ResizeObserver rather than a `viewBox`.** Scaling one fixed viewBox to the container is
 * the cheap way to be responsive, and it scales the *text* along with the drawing - tick labels end
 * up microscopic in a sidebar and oversized on a dashboard, in a library whose whole job is
 * consistent typography. So the chart instead redraws at the container's real pixel width, and
 * every label is rendered at its intended size whatever the chart's width.
 *
 * Subclasses implement `draw`, which is called with the plot's pixel dimensions and must fill the
 * supplied `<svg>`. It is called again on every resize, so it must be idempotent - `drawInto`
 * empties the element first.
 */
export abstract class ChartFrame<AttrsType extends ChartBaseAttrsType> extends Component<AttrsType> {
    #root: HTMLDivElement
    #svgHost: HTMLDivElement
    /** Holds the visually-hidden data table, when the chart has one */
    #srHost: HTMLDivElement
    #legendHost: HTMLDivElement
    #emptyHost: HTMLDivElement
    #observer: ResizeObserver | undefined
    /** Last width drawn at, so a resize that changes nothing doesn't force a redraw */
    #lastWidth = 0
    /** Drawing height of the last render, so the tooltip can clamp without a layout read */
    #lastHeight = 0
    /** The current drawing, for the hover classes and the subclass's own use */
    #svg: SVGElement | undefined
    /** Behind the drawing, for a chart that paints some of its marks on a canvas */
    #underlay: HTMLDivElement | undefined
    /** The next click ended a drag rather than activating anything */
    #swallowClick = false
    /** The marks of the current drawing in order, which is the order the arrow keys walk */
    #markList: {element: SVGElement, mark: ChartMark}[] = []
    /** Where the arrow keys have got to, or -1 */
    #cursor = -1
    /** Says what the arrow keys landed on, for a screen reader */
    #liveHost: HTMLDivElement
    #chartId = nextChartId++
    /** The `<svg>` being drawn right now, which is where a pattern's definition has to go */
    #drawing: SVGElement | undefined
    #tableTimer = 0
    /** Where the drawing starts inside the root, which is where tooltip coordinates are measured from */
    #drawingTop = 0
    /** What each drawn mark says. A WeakMap, so a redraw's discarded elements go with their marks */
    #markOf = new WeakMap<EventTarget, ChartMark>()
    #activeMark: SVGElement | undefined
    #plotFrame = 0
    #tweenFrame = 0
    /** Entries the reader has turned off from the legend */
    #hidden = new Set<number>()
    /** What the legend currently shows, so a redraw that changes none of it keeps its buttons and their focus */
    #legendKey = ""
    #hasEntered = false
    protected tooltip: ChartTooltip
    protected chartAttrs: AttrsType

    constructor(attrs: AttrsType, children: RenderableElements[]) {
        super(attrs, children)
        mountChartStyles()
        this.chartAttrs = attrs
        this.tooltip = new ChartTooltip()

        this.#svgHost = document.createElement("div")
        this.#svgHost.className = "vtc-chart-drawing"
        // One set of listeners on an element that outlives every redraw, rather than a handler per
        // mark: a chart may hold thousands of marks, and a redraw replaces all of them.
        this.#svgHost.addEventListener("pointerover", this.#onPointerOver)
        this.#svgHost.addEventListener("pointerout", this.#onPointerOut)
        this.#svgHost.addEventListener("click", this.#onClick)
        this.#svgHost.addEventListener("keydown", this.#onKeyDown)
        this.#svgHost.addEventListener("focusout", this.#onFocusOut)
        // The drawing is hidden from assistive technology in favour of the table, but this holds it and
        // takes focus, so it needs a name and a role of its own.
        if (attrs.keyboard ?? true) {
            this.#svgHost.tabIndex = 0
            this.#svgHost.setAttribute("role", "group")
            const name = attrs.ariaLabel ?? attrs.title
            if (name !== undefined) {
                this.#svgHost.setAttribute("aria-label", name)
            }
        }
        this.#liveHost = document.createElement("div")
        this.#liveHost.className = "vtc-chart-sr"
        this.#liveHost.setAttribute("aria-live", "polite")
        this.#srHost = document.createElement("div")
        this.#srHost.className = "vtc-chart-sr"
        this.#legendHost = document.createElement("div")
        this.#emptyHost = document.createElement("div")
        this.#emptyHost.className = "vtc-chart-empty"
        this.#emptyHost.hidden = true

        this.#root = document.createElement("div")
        this.#root.className = "vtc-chart"
        if (attrs.title !== undefined && attrs.title !== "") {
            const titleEl = document.createElement("div")
            titleEl.className = "vtc-chart-title"
            titleEl.textContent = attrs.title
            this.#root.appendChild(titleEl)
        }
        this.#root.appendChild(this.#svgHost)
        this.#root.appendChild(this.#srHost)
        this.#root.appendChild(this.#liveHost)
        this.#root.appendChild(this.#emptyHost)
        this.#root.appendChild(this.#legendHost)
        this.#root.appendChild(this.tooltip.element)

        passthroughAttrsToElement<HTMLDivElement>(this.#root, attrs)
    }

    override mount() {
        // The first measurement has to happen after the element is in the document - before that
        // its width is 0 and every chart would draw into nothing.
        this.#observer = new ResizeObserver(() => this.#redraw())
        this.#observer.observe(this.#root)
        this.#redraw()
    }

    override unmount() {
        this.#observer?.disconnect()
        this.#observer = undefined
        cancelAnimationFrame(this.#plotFrame)
        this.#plotFrame = 0
        cancelAnimationFrame(this.#tweenFrame)
        this.#tweenFrame = 0
        clearTimeout(this.#tableTimer)
        this.#tableTimer = 0
        // A later mount has to draw again, or a re-attached chart would stay as it was left
        this.#lastWidth = 0
    }

    /**
     * Changes some of the chart's attrs and redraws, keeping everything else about it: the element,
     * what the reader has hidden or zoomed to, and any listeners on the page.
     *
     * Reach it through `getComponent`, since a JSX tag evaluates to the element and not the chart:
     * `const chart = getComponent<LineChart>(<LineChart .../>); chart.update({data})`.
     */
    update(attrs: Partial<AttrsType>): void {
        this.chartAttrs = {...this.chartAttrs, ...attrs}
        this.attrsChanged(attrs)
        this.redrawNow()
    }

    /** For a subclass that derives something from its attrs: called before `update` redraws */
    protected attrsChanged(_changed: Partial<AttrsType>): void {
        // Nothing to derive by default
    }

    #redraw(): void {
        const width = Math.floor(this.#root.clientWidth)
        if (width <= 0 || width === this.#lastWidth) {
            return
        }
        this.#lastWidth = width
        this.drawInto(width)
    }

    /** Rebuilds the whole drawing at `width` px, plus the legend and empty state */
    protected drawInto(width: number): void {
        const attrs = this.chartAttrs
        const height = attrs.height ?? 220
        this.#lastHeight = height

        if (this.isEmpty()) {
            this.#svg?.remove()
            this.#svg = undefined
            this.#srHost.replaceChildren()
            this.#legendHost.replaceChildren()
            this.#emptyHost.hidden = false
            this.#emptyHost.style.height = `${height}px`
            this.#emptyHost.replaceChildren(
                document.createTextNode(attrs.emptyMessage ?? String(ChartThemeOptions.emptySymbol({}, [])))
            )
            return
        }
        this.#emptyHost.hidden = true

        const svg = this.#newSvg(width, height)

        // Two ways to be readable, and which one applies depends on whether the chart has values a
        // table can hold. A table is much the better of the two - it carries the actual numbers
        // rather than just a name - so a chart that can produce one hides the drawing from
        // assistive tech entirely and lets the table be the content.
        const table = this.dataTable()
        if (table) {
            svg.setAttribute("aria-hidden", "true")
            this.#srHost.replaceChildren(buildDataTable(attrs.ariaLabel ?? attrs.title, table))
        } else {
            svg.setAttribute("role", "img")
            const name = attrs.ariaLabel ?? attrs.title
            if (name !== undefined) {
                svg.setAttribute("aria-label", name)
            }
            this.#srHost.replaceChildren()
        }

        this.#activeMark = undefined
        this.tooltip.hide()
        this.#markList = []
        this.#drawing = svg
        this.draw(svg, width, height)
        // Only the first drawing: replaying the entrance on every resize would make a chart flicker
        // whenever its container changed size.
        if (!this.#hasEntered) {
            this.#hasEntered = true
            if (attrs.animate ?? true) {
                svg.classList.add("vtc-chart-enter")
            }
        }
        if (this.#svg) {
            this.#svg.replaceWith(svg)
        } else {
            this.#svgHost.appendChild(svg)
        }
        this.#svg = svg
        this.#drawingTop = this.#svgHost.offsetTop

        this.#renderLegend()
    }

    #renderLegend(): void {
        const attrs = this.chartAttrs
        const entries = attrs.hideLegend ? [] : this.legendEntries()
        const toggles = entries.length > 1 && (attrs.legendToggle ?? true)
        const key = `${toggles}${this.usesPatterns()}\u0001${entries.map(entry => `${entry.label}\u0000${entry.color}`).join("\u0002")}`
        if (key !== this.#legendKey) {
            this.#legendKey = key
            const legend = buildLegend(entries, toggles ? (index) => this.#toggleEntry(index) : undefined, this.usesPatterns() ? patternSwatch : undefined)
            this.#legendHost.replaceChildren(...(legend ? [legend] : []))
        }
        if (toggles) {
            this.#legendHost.querySelectorAll(".vtc-chart-legend-item").forEach((item, index) => {
                item.setAttribute("aria-pressed", String(!this.#hidden.has(index)))
            })
        }
    }

    #toggleEntry(index: number): void {
        if (this.#hidden.has(index)) {
            this.#hidden.delete(index)
        } else {
            this.#hidden.add(index)
        }
        this.entryToggled()
        this.redrawNow()
    }

    /** Whether the reader has turned this legend entry off. An index into `legendEntries` */
    protected isEntryHidden(index: number): boolean {
        return this.#hidden.has(index)
    }

    /** Hides or shows an entry without redrawing, for a chart setting its starting state */
    protected setEntryHidden(index: number, hidden: boolean): void {
        if (hidden) {
            this.#hidden.add(index)
        } else {
            this.#hidden.delete(index)
        }
    }

    /** For a subclass that derives something from what is hidden: called before the redraw */
    protected entryToggled(): void {
        // Nothing to derive by default
    }

    /**
     * Runs `step` from 0 to 1 over `duration` ms, redrawing the plot each frame, for a change of data.
     * Reports only 1 when animation is off or the reader asked for reduced motion.
     */
    protected tween(duration: number, step: (progress: number) => void): void {
        cancelAnimationFrame(this.#tweenFrame)
        this.#tweenFrame = 0
        const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
        if ((this.chartAttrs.animate ?? true) === false || reduced || this.#lastWidth <= 0) {
            step(1)
            return
        }
        const started = performance.now()
        step(0)
        const frame = (now: number) => {
            const progress = Math.min(1, (now - started) / duration)
            // An ease-out: quick to start, so the reader sees the change the moment they asked for it
            step(1 - (1 - progress) * (1 - progress))
            this.redrawPlot()
            this.#tweenFrame = progress < 1 ? requestAnimationFrame(frame) : 0
        }
        this.#tweenFrame = requestAnimationFrame(frame)
    }

    #newSvg(width: number, height: number): SVGElement {
        const svg = svgEl("svg", {class: "vtc-chart-svg", width, height, viewBox: `0 0 ${width} ${height}`})
        if (this.chartAttrs.onPointClick) {
            svg.classList.add("vtc-chart-clickable")
        }
        return svg
    }

    /**
     * Rebuilds the drawing alone, on the next frame, however many times it is asked for before then.
     *
     * For state that changes at display rate, like a pan. The table and the legend describe the data
     * rather than the view, so they are left alone.
     */
    protected redrawPlot(): void {
        if (this.#plotFrame !== 0 || this.#lastWidth <= 0) {
            return
        }
        this.#plotFrame = requestAnimationFrame(() => {
            this.#plotFrame = 0
            const previous = this.#svg
            if (!previous) {
                return
            }
            const svg = this.#newSvg(this.#lastWidth, this.#lastHeight)
            for (const name of ["aria-hidden", "role", "aria-label"]) {
                const value = previous.getAttribute(name)
                if (value !== null) {
                    svg.setAttribute(name, value)
                }
            }
            this.#activeMark = undefined
            this.#markList = []
            this.#drawing = svg
            this.#cursor = -1
            this.draw(svg, this.#lastWidth, this.#lastHeight)
            previous.replaceWith(svg)
            this.#svg = svg
        })
    }

    /** The element holding the drawing. It outlives every redraw, so listeners belong here */
    protected get drawingHost(): HTMLDivElement {
        return this.#svgHost
    }

    /** The current `<svg>`, which is replaced by every redraw */
    protected get currentSvg(): SVGElement | undefined {
        return this.#svg
    }

    /** Registers something drawn as a thing a reader can point at. Call it from `draw` */
    protected addMark(element: SVGElement, mark: ChartMark): void {
        element.classList.add("vtc-chart-mark")
        this.#markOf.set(element, mark)
        this.#markList.push({element, mark})
    }

    protected usesPatterns(): boolean {
        return this.chartAttrs.patterns ?? ChartThemeOptions.patterns
    }

    /** The fill for a palette slot: its color, or its pattern over that color when patterns are on */
    protected fillFor(slot: number, color: string): string {
        if (!this.usesPatterns() || !this.#drawing) {
            return color
        }
        return patternFill(this.#drawing, `vtc-pattern-${this.#chartId}-${slot}`, slot, color)
    }

    /** The dashes that tell a line apart when patterns are on */
    protected dashFor(slot: number): string | undefined {
        return this.usesPatterns() ? patternDash(slot) : undefined
    }

    /** How many things the arrow keys walk. By default, every mark */
    protected keyboardCount(): number {
        return this.#markList.length
    }

    /** Shows one of them and returns what a screen reader should say about it */
    protected keyboardShow(index: number): string {
        const entry = this.#markList[index]
        this.#activeMark?.classList.remove("vtc-chart-mark-active")
        this.#activeMark = entry.element
        entry.element.classList.add("vtc-chart-mark-active")
        this.#svg?.classList.add("vtc-chart-hover")
        this.showTooltip(entry.mark.title, entry.mark.rows, entry.mark.anchor)
        return describe(entry.mark.title, entry.mark.rows)
    }

    /** What activating one of them reports */
    protected keyboardDetail(index: number): ChartPointDetail | undefined {
        return this.#markList[index]?.mark.detail
    }

    protected keyboardClear(): void {
        this.#activeMark?.classList.remove("vtc-chart-mark-active")
        this.#activeMark = undefined
        this.#svg?.classList.remove("vtc-chart-hover")
        this.tooltip.hide()
    }

    /** For keys a chart adds of its own, like zooming. Return true when one was handled */
    protected keyboardExtra(_event: KeyboardEvent): boolean {
        return false
    }

    #onKeyDown = (event: KeyboardEvent) => {
        if ((this.chartAttrs.keyboard ?? true) === false || event.target !== this.#svgHost) {
            return
        }
        if (this.keyboardExtra(event)) {
            event.preventDefault()
            return
        }
        const count = this.keyboardCount()
        let next = this.#cursor
        switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
                next = this.#cursor < 0 ? 0 : Math.min(count - 1, this.#cursor + 1)
                break
            case "ArrowLeft":
            case "ArrowUp":
                next = this.#cursor < 0 ? 0 : Math.max(0, this.#cursor - 1)
                break
            case "Home":
                next = 0
                break
            case "End":
                next = count - 1
                break
            case "Enter":
            case " ": {
                const detail = this.#cursor >= 0 ? this.keyboardDetail(this.#cursor) : undefined
                if (detail) {
                    this.chartAttrs.onPointClick?.(detail)
                    event.preventDefault()
                }
                return
            }
            case "Escape":
                if (this.#cursor >= 0) {
                    this.#clearKeyboard()
                    event.preventDefault()
                }
                return
            default:
                return
        }
        // Only ever the keys above: everything else stays the browser's, Tab above all
        event.preventDefault()
        if (count > 0) {
            this.#cursor = next
            this.#liveHost.textContent = this.keyboardShow(next)
        }
    }

    #onFocusOut = () => {
        if (this.#cursor >= 0) {
            this.#clearKeyboard()
        }
    }

    #clearKeyboard(): void {
        this.#cursor = -1
        this.#liveHost.textContent = ""
        this.keyboardClear()
    }

    /** The chart's values with nothing left out, for export. The hidden table may sample a long series */
    protected exportTable(): ChartDataTable | undefined {
        return this.dataTable()
    }

    /** The chart's values as CSV, as their formats write them */
    toCsv(): string {
        const table = this.exportTable()
        return table ? tableToCsv(table) : ""
    }

    /** A stand-alone copy of the drawing, with its title and legend and every style written in */
    toSvgString(): string {
        return this.#standalone().markup
    }

    /** The drawing as a PNG, on the page's background color. `scale` multiplies its pixels (default: `2`) */
    toPngBlob(scale: number = 2): Promise<Blob> {
        const {markup, width, height} = this.#standalone()
        const background = getComputedStyle(this.#root).getPropertyValue("--background").trim() || "white"
        return svgToPng(markup, width, height, scale, background)
    }

    /** Saves the chart through the browser, as a file named `filename` */
    async download(format: "csv" | "svg" | "png", filename: string): Promise<void> {
        if (format === "png") {
            saveFile(await this.toPngBlob(), filename)
        } else if (format === "svg") {
            saveFile(new Blob([this.toSvgString()], {type: "image/svg+xml"}), filename)
        } else {
            // A byte order mark, so a spreadsheet reads the file as UTF-8 and not its own old default
            saveFile(new Blob(["\ufeff", this.toCsv()], {type: "text/csv;charset=utf-8"}), filename)
        }
    }

    #standalone(): {markup: string, width: number, height: number} {
        const svg = this.#svg
        if (!svg) {
            throw new Error("velochart: there is no drawing to export. A chart draws once it is in the document and has data")
        }
        const legend = this.chartAttrs.hideLegend ? [] : this.legendEntries().filter((_, i) => !this.#hidden.has(i))
        return standaloneSvg(svg, this.chartAttrs.title, legend, this.#underlay?.querySelector("canvas") ?? undefined, this.#root)
    }

    /** Shows the tooltip. Coordinates are the drawing's own, which sits below any title */
    protected showTooltip(title: string, rows: TooltipRow[], anchor: TooltipAnchor): void {
        const top = this.#drawingTop
        this.tooltip.show(title, rows, {...anchor, y: anchor.y + top}, {
            width: this.#lastWidth, height: this.#lastHeight + top
        })
    }

    #onPointerOver = (event: Event) => {
        const mark = this.#markOf.get(event.target as EventTarget)
        if (!mark) {
            return
        }
        const element = event.target as SVGElement
        this.#activeMark?.classList.remove("vtc-chart-mark-active")
        this.#activeMark = element
        element.classList.add("vtc-chart-mark-active")
        this.#svg?.classList.add("vtc-chart-hover")
        this.showTooltip(mark.title, mark.rows, mark.anchor)
    }

    #onPointerOut = (event: Event) => {
        if (event.target !== this.#activeMark) {
            return
        }
        this.#activeMark?.classList.remove("vtc-chart-mark-active")
        this.#activeMark = undefined
        this.#svg?.classList.remove("vtc-chart-hover")
        this.tooltip.hide()
    }

    #onClick = (event: Event) => {
        const callback = this.chartAttrs.onPointClick
        if (this.#swallowClick) {
            this.#swallowClick = false
            return
        }
        if (!callback) {
            return
        }
        const detail = this.#markOf.get(event.target as EventTarget)?.detail ?? this.clickDetail(event as MouseEvent)
        if (detail) {
            callback(detail)
        }
    }

    /** Marks the click that follows the end of a drag as not being a click */
    protected swallowNextClick(): void {
        this.#swallowClick = true
        // A drag released off the chart produces no click here, and must not eat the next real one
        setTimeout(() => {
            this.#swallowClick = false
        }, 0)
    }

    /** A layer behind the drawing that survives every redraw. Created when first asked for */
    protected get underlay(): HTMLDivElement {
        if (!this.#underlay) {
            this.#underlay = document.createElement("div")
            this.#underlay.className = "vtc-chart-underlay"
            this.#underlay.setAttribute("aria-hidden", "true")
            this.#svgHost.prepend(this.#underlay)
        }
        return this.#underlay
    }

    /** Rebuilds the screen reader's table soon, for data arriving too quickly to rebuild it each time */
    protected refreshTableSoon(): void {
        if (this.#tableTimer !== 0) {
            return
        }
        this.#tableTimer = setTimeout(() => {
            this.#tableTimer = 0
            const table = this.dataTable()
            if (table) {
                this.#srHost.replaceChildren(buildDataTable(this.chartAttrs.ariaLabel ?? this.chartAttrs.title, table))
            }
        }, 1000)
    }

    /** For a chart whose hit target is the whole plot: what a click there activated */
    protected clickDetail(_event: MouseEvent): ChartPointDetail | undefined {
        return undefined
    }

    /** Forces a redraw at the current width - for a subclass whose state changed */
    protected redrawNow(): void {
        if (this.#lastWidth > 0) {
            this.drawInto(this.#lastWidth)
        }
    }

    /** Formats a value for ticks and tooltips */
    protected format(value: number): string {
        return (this.chartAttrs.formatValue ?? String)(value)
    }

    /** True when there is nothing to draw, so the empty state shows instead */
    protected abstract isEmpty(): boolean

    /** Fills `svg` with the chart at these pixel dimensions */
    protected abstract draw(svg: SVGElement, width: number, height: number): void

    /** Legend entries; return `[]` for a chart that doesn't warrant one */
    protected abstract legendEntries(): {label: string, color: string}[]

    /**
     * The chart's values as a table, for screen readers - or `undefined` for a chart whose reading
     * is a single number the `ariaLabel` already states, like `Gauge`.
     */
    protected abstract dataTable(): ChartDataTable | undefined

    override render(): HTMLDivElement {
        return this.#root
    }
}

/** A mark as a sentence for a screen reader: its name, then each row's label and value */
function describe(title: string, rows: TooltipRow[]): string {
    return [title, ...rows.map(row => `${row.label} ${row.value}`.trim())].filter(part => part.length > 0).join(", ")
}

/**
 * Builds the visually-hidden table a screen reader reads instead of the drawing.
 *
 * **Never an SVG `<title>` element.** A `<title>` makes browsers pop their own native tooltip on
 * hover - slow, unstyled, unpositionable, and directly in the way of the chart's own tooltip - and
 * it contributes nothing, because `aria-label` already wins the accessible-name computation. This
 * component used to set both; the `<title>` was pure visual noise.
 */
function buildDataTable(caption: string | undefined, table: ChartDataTable): HTMLTableElement {
    const element = document.createElement("table")
    if (caption !== undefined) {
        const captionEl = document.createElement("caption")
        captionEl.textContent = caption
        element.appendChild(captionEl)
    }
    const head = document.createElement("thead")
    const headRow = document.createElement("tr")
    for (const column of table.columns) {
        const th = document.createElement("th")
        th.setAttribute("scope", "col")
        th.textContent = column
        headRow.appendChild(th)
    }
    head.appendChild(headRow)
    element.appendChild(head)
    const body = document.createElement("tbody")
    for (const row of table.rows) {
        const tr = document.createElement("tr")
        row.forEach((cell, index) => {
            // The first cell of each row names the category, so it is the row's header
            const el = document.createElement(index === 0 ? "th" : "td")
            if (index === 0) {
                el.setAttribute("scope", "row")
            }
            el.textContent = cell
            tr.appendChild(el)
        })
        body.appendChild(tr)
    }
    element.appendChild(body)
    return element
}
