import { ChartFrame } from "../core/chart-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type {
    ChartAnnotationType, ChartAxisType, ChartBaseAttrsType, ChartCurve, ChartDataTable, ChartPointDetail, ChartPointType,
    ChartSeriesKind, ChartSeriesType, PlotBox, TooltipRow
} from "../core/chart-common.ts"
import {
    fullTimeFormat, linearScale, logDomain, logScale, logTicks, niceTicks, ticksWithin, timeTicks
} from "../core/scale.ts"
import type { Scale, ScaleKind } from "../core/scale.ts"
import { CanvasMarks } from "./canvas-marks.ts"
import { joinSyncGroup } from "./cursor-sync.ts"
import { lttb, minMax } from "../core/downsample.ts"
import type { DownsampleAlgorithm } from "../core/downsample.ts"
import { errorRange, linearFit, movingAverage } from "./statistics.ts"
import { areaPath, linePath } from "./line-path.ts"
import type { PathPoint } from "./line-path.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/** Attrs every chart on x and y axes accepts */
export type CartesianAttrsType = {
    /** One entry per position along the x axis */
    data: ChartPointType[]
    /** The series to plot; their order sets their palette slots */
    series: ChartSeriesType[]
    /** The x axis. Its type follows the points' `x` when this is unset */
    xAxis?: ChartAxisType
    /** The left value axis */
    yAxis?: ChartAxisType
    /** The right value axis, which series with `yAxis: "right"` read against */
    yAxisRight?: ChartAxisType
    /** Stacks the series on top of each other rather than overlaying them (default: `false`) */
    stacked?: boolean
    /** Draws a dot at each point of a line or area (default: `true` when there are fewer than 40 points) */
    showDots?: boolean
    /** Starts the value axis at zero rather than at the data's own minimum (default: `true`) */
    beginAtZero?: boolean
    /** Joins a line across a missing value rather than leaving a gap (default: `false`) */
    spanGaps?: boolean
    /**
     * Bars run left-to-right instead of bottom-to-top (default: `false`). Only for bars.
     *
     * Worth reaching for whenever the category labels are words rather than dates - a horizontal
     * bar gives each label a full line to itself, which is the usual reason vertical labels end up
     * rotated and unreadable.
     */
    horizontal?: boolean
    /**
     * What a pointer reads (default: `"index"`, except where a chart says otherwise). `"index"` is every
     * series at the nearest x, `"nearest"` the one closest point, and `"mark"` the bar or point under
     * the pointer.
     */
    hover?: "index" | "mark" | "nearest" | "none"
    /** Lines, bands and labelled points drawn on the plot */
    annotations?: ChartAnnotationType[]
    /** Writes each value beside its mark. Thinned when there is not room for them all (default: `false`) */
    showValues?: boolean
    /** Follows the pointer with lines to the axes and reads their values off there (default: `false`) */
    crosshair?: boolean
    /** Charts sharing this name move their hover cursors together, and zoom together */
    syncGroup?: string
    /**
     * Lets a reader zoom and pan these axes (default: off). Drag pans, ctrl or cmd and the wheel zooms, a
     * pinch zooms on a touch screen or trackpad, and a double click goes back to everything. Not for
     * `horizontal` bars.
     */
    zoom?: "x" | "y" | "xy"
    /**
     * Whether the wheel needs ctrl or cmd held to zoom (default: `"modifier"`). `"always"` takes every
     * scroll over the chart, which traps a reader scrolling down the page, so reach for it only when
     * the chart fills the page.
     */
    wheelZoom?: "modifier" | "always"
    /** Called whenever the view changes, with `undefined` once it is back to everything */
    onZoom?: (view: ChartViewType | undefined) => void
    /** Dragging selects a range on x, or a rectangle with `"xy"`. With `zoom` set, shift and drag pans */
    brush?: true | "x" | "xy"
    /** Called when a brush is released, with the range and the points in it */
    onBrush?: (selection: ChartViewType & {points: ChartPointType[]}) => void
    /** Zooms to a range when it is brushed (default: `true` when `zoom` is set) */
    brushZoom?: boolean
    /** Draws an overview under the plot with a window a reader can drag and resize. Needs no `zoom` (default: `false`) */
    rangeSlider?: boolean
    /**
     * Thins a long line to what its pixels can show, when it has more than `threshold` points in view
     * (default: `{algorithm: "lttb", threshold: twice the plot's width}`). The tooltip and the hidden table
     * still read every point. `false` draws them all.
     */
    downsample?: false | {algorithm?: DownsampleAlgorithm, threshold?: number}
    /**
     * `"canvas"` paints marks on a canvas instead of as elements (default: `"svg"`), which is what makes
     * tens of thousands of points or bars practical. Axes, annotations and interaction stay as they are.
     * A smooth line draws straight, and a mark can't be hovered on its own, so `hover: "mark"` reads `"index"`.
     */
    renderer?: "svg" | "canvas"
    /** The most rows the hidden table holds, sampled evenly from the data (default: `1000`) */
    maxTableRows?: number
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

/** A chart's view: the domain in axis units. `yMin` and `yMax` are the left axis's, and are unset unless y was zoomed */
export type ChartViewType = {xMin: number, xMax: number, yMin?: number, yMax?: number}

/** What the reader has zoomed to, as this class holds it: each y axis has its own range */
type View = {xMin: number, xMax: number, yLeft?: [number, number], yRight?: [number, number]}

/** How the current pointer drag got started */
type Drag =
    | {kind: "pan", startX: number, startY: number, view: {x: Scale, y: Scale, yRight?: Scale}, moved: boolean}
    | {kind: "brush", startX: number, startY: number, x: number, y: number, moved: boolean}
    | {kind: "slider-window" | "slider-min" | "slider-max", startX: number, xMin: number, xMax: number, moved: boolean}

type Row = {x: number, point: ChartPointType, index: number}

/** One axis, resolved against the data for one drawing */
type Axis = {scale: Scale, ticks: number[], format: (value: number) => string, definition: ChartAxisType}

/** Everything one drawing worked out, which a later hover reads rather than recomputing */
type Layout = {
    box: PlotBox
    x: Axis
    yLeft: Axis
    yRight: Axis | undefined
    /** The rows in view, as indices into `#rows` */
    start: number
    end: number
    /** The pixel a bar group is centred in, along the x axis */
    slot: number
    /** The overview under the plot, when there is one */
    slider: {left: number, top: number, width: number, height: number, scale: Scale} | undefined
    /** Whether anything may run past the plot, so that the marks have to be cut off at its edge */
    clip: boolean
}

let nextClipId = 0
/** The overview's height and the gap above it */
const SLIDER_HEIGHT = 28
const SLIDER_GAP = 34

/** Share of a category's slot left empty, so neighbouring groups read as separate */
const CATEGORY_PADDING = 0.25
const MARGIN = {left: 56, right: 12, top: 12, bottom: 32}
/** Space a title takes beside an axis */
const AXIS_TITLE = 18
/** An average glyph width. Estimated, since measuring would mean a layout pass per label */
const GLYPH = 7

/**
 * The engine under every chart with x and y axes: line, area, bar, mixed, scatter and bubble are all
 * this with a different default for how a series draws.
 *
 * **Values live in typed arrays, one per series, with `NaN` for a missing value.** That is what lets a
 * chart hold a few hundred thousand points without a per-point object, and it is why a gap has a
 * single representation everywhere: a line breaks at it, a bar is absent, and the tooltip skips it.
 */
export abstract class CartesianFrame<AttrsType extends CartesianAttrsType> extends ChartFrame<AttrsType> {
    #rows: Row[] | undefined
    #xKind: ScaleKind = "category"
    /** `#values[series][row]`, in `#rows` order */
    #values: Float64Array[] = []
    /** The lower and upper edge of each value once stacked. Unstacked, the lower edge is zero */
    #lows: Float64Array[] = []
    #highs: Float64Array[] = []
    /** What is drawn this frame: `#highs`/`#lows`, or on their way there during a change of data */
    #shownHighs: Float64Array[] = []
    #shownLows: Float64Array[] = []
    #seededHidden = false
    #layout: Layout | undefined
    /** The nearest row the marker sits on, so an unchanged hover rewrites nothing */
    #cursorRow = -1
    #cursorLine: SVGElement | undefined
    #listening = false
    #crosshair: {horizontal: SVGElement, vertical: SVGElement, yBadge: SVGElement, yText: SVGElement, xBadge: SVGElement, xText: SVGElement} | undefined
    #leaveSyncGroup: (() => void) | undefined
    /** Tells the rest of the group where the cursor went, or that it left */
    #broadcastCursor: ((x: number | undefined) => void) | undefined
    #broadcastView: ((view: {xMin: number, xMax: number} | undefined) => void) | undefined
    /** What the reader has zoomed to. Unset, the chart shows everything */
    #view: View | undefined
    #drag: Drag | undefined
    /** Fingers on the chart, for a pinch */
    #touches = new Map<number, {x: number, y: number}>()
    #pinchDistance = 0
    #brushRect: SVGElement | undefined
    #canvas: CanvasMarks | undefined
    #clipId = `vtc-chart-clip-${nextClipId++}`
    #fullX: [number, number] = [0, 1]

    override mount() {
        super.mount()
        const group = this.chartAttrs.syncGroup
        if (group !== undefined) {
            const member = joinSyncGroup(group, {
                cursor: (x) => this.#showSyncedCursor(x),
                view: (view) => this.#setView(view, false),
            })
            this.#broadcastCursor = member.broadcastCursor
            this.#broadcastView = member.broadcastView
            this.#leaveSyncGroup = member.leave
        }
    }

    override unmount() {
        super.unmount()
        this.#leaveSyncGroup?.()
        this.#leaveSyncGroup = undefined
        this.#broadcastCursor = undefined
        this.#broadcastView = undefined
    }

    /** Zooms to a range. An axis left out of `view` stays as it is */
    zoomTo(view: ChartViewType): void {
        const yLeft = view.yMin !== undefined && view.yMax !== undefined ? [view.yMin, view.yMax] as [number, number] : undefined
        this.#setView({xMin: view.xMin, xMax: view.xMax, yLeft}, true)
    }

    /** Back to showing everything */
    resetZoom(): void {
        this.#setView(undefined, true)
    }

    /** The range in view, or `undefined` when showing everything */
    getView(): ChartViewType | undefined {
        const view = this.#view
        return view ? {xMin: view.xMin, xMax: view.xMax, yMin: view.yLeft?.[0], yMax: view.yLeft?.[1]} : undefined
    }

    /**
     * Adds points to the end of the data, for a live feed. Older points drop off past `maxPoints`.
     *
     * Any number of calls between two frames costs one redraw, and a view at the live edge of the data
     * moves along with it, so a reader looking at the latest stays on the latest.
     */
    appendData(points: ChartPointType[], options?: {maxPoints?: number}): void {
        const data = this.chartAttrs.data
        const atEdge = this.#view !== undefined && this.#view.xMax >= this.#fullX[1]
        const span = this.#view ? this.#view.xMax - this.#view.xMin : 0
        data.push(...points)
        const max = options?.maxPoints
        if (max !== undefined && data.length > max) {
            data.splice(0, data.length - max)
        }
        this.#rows = undefined
        const rows = this.#ensureRows()
        this.#fullX = this.#xDomain(rows, this.#hasKind("bar"))
        if (atEdge && this.#view) {
            this.#view = {...this.#view, xMin: this.#fullX[1] - span, xMax: this.#fullX[1]}
        }
        this.refreshTableSoon()
        this.redrawPlot()
    }

    #setView(view: View | undefined, announce: boolean): void {
        this.#view = view
        this.redrawPlot()
        if (announce) {
            this.#broadcastView?.(view ? {xMin: view.xMin, xMax: view.xMax} : undefined)
            this.chartAttrs.onZoom?.(this.getView())
        }
    }

    #hoverMode(): "index" | "mark" | "nearest" | "none" {
        const mode = this.chartAttrs.hover ?? this.defaultHover()
        // A mark painted on a canvas isn't an element, so nothing can tell that the pointer is on it
        return mode === "mark" && this.chartAttrs.renderer === "canvas" ? "index" : mode
    }

    #canZoom(): boolean {
        return this.chartAttrs.zoom !== undefined && !(this.chartAttrs.horizontal ?? false)
    }

    #canBrush(): boolean {
        return this.chartAttrs.brush !== undefined && !(this.chartAttrs.horizontal ?? false)
    }

    #markInteractive(svg: SVGElement): void {
        if (this.#canBrush()) {
            svg.classList.add("vtc-chart-brushable")
        } else if (this.#canZoom()) {
            svg.classList.add("vtc-chart-zoomable")
        }
    }

    /** How a series with no `type` of its own is drawn */
    protected abstract defaultSeriesKind(): ChartSeriesKind

    protected defaultHover(): "index" | "mark" | "nearest" {
        return "index"
    }

    protected seriesKind(series: ChartSeriesType): ChartSeriesKind {
        return series.type ?? this.defaultSeriesKind()
    }

    protected override attrsChanged(changed: Partial<AttrsType>): void {
        const fromHighs = this.#shownHighs
        const fromLows = this.#shownLows
        const rowCount = this.#rows?.length ?? -1
        this.#rows = undefined
        if (!changed.data && !changed.series) {
            return
        }
        const rows = this.#ensureRows()
        // A change of shape has no in-between to show, so only values moving get a transition
        if (rows.length !== rowCount || fromHighs.length !== this.#highs.length || rows.length > 2000) {
            return
        }
        const highs = this.#highs
        const lows = this.#lows
        const mix = (from: Float64Array[], to: Float64Array[], progress: number) => to.map((column, s) => {
            const mixed = new Float64Array(column.length)
            for (let i = 0; i < column.length; i++) {
                const start = from[s][i]
                mixed[i] = Number.isNaN(start) ? column[i] : start + (column[i] - start) * progress
            }
            return mixed
        })
        this.tween(300, (progress) => {
            this.#shownHighs = progress === 1 ? highs : mix(fromHighs, highs, progress)
            this.#shownLows = progress === 1 ? lows : mix(fromLows, lows, progress)
        })
    }

    protected override entryToggled(): void {
        this.#rows = undefined
    }

    protected override isEmpty(): boolean {
        return this.chartAttrs.data.length === 0 || this.chartAttrs.series.length === 0
    }

    protected override legendEntries(): {label: string, color: string}[] {
        const series = this.chartAttrs.series
        if (series.length < 2) {
            return []
        }
        return series.map((s, i) => ({label: s.label ?? s.key, color: seriesColor(i, s.color)}))
    }

    protected override dataTable(): ChartDataTable | undefined {
        const {series} = this.chartAttrs
        const rows = this.#ensureRows()
        // Sampled evenly past the cap: a hundred thousand table rows would be slower than the chart, and
        // no one is reading them aloud one at a time.
        const every = Math.max(1, Math.ceil(rows.length / (this.chartAttrs.maxTableRows ?? 1000)))
        return {
            columns: ["", ...series.map(s => s.label ?? s.key)],
            // Each series' own value, not the stacked running total - the same choice the tooltip
            // makes, so what is read aloud matches what a sighted reader is told. A gap is an empty
            // cell, which a screen reader announces as one.
            rows: rows.filter((_, position) => position % every === 0).map((row, sampled) => [this.#rowTitle(row), ...series.map((s, i) => {
                const value = this.#values[i][sampled * every]
                return Number.isNaN(value) ? "" : this.#formatFor(s)(value)
            })])
        }
    }

    #formatFor(series: ChartSeriesType): (value: number) => string {
        const attrs = this.chartAttrs
        const axis = series.yAxis === "right" ? attrs.yAxisRight : attrs.yAxis
        return axis?.format ?? ((value) => this.format(value))
    }

    /** What a row is called: its label, or its formatted position on the axis */
    #rowTitle(row: Row): string {
        if (row.point.label !== undefined) {
            return row.point.label
        }
        const axis = this.chartAttrs.xAxis
        if (axis?.format) {
            return axis.format(row.x)
        }
        if (this.#xKind === "time") {
            return fullTimeFormat(axis?.utc ?? false)(row.x)
        }
        return this.#xKind === "category" ? String(row.index) : String(row.x)
    }

    /** Sorts the points along the x axis and lays their values out in typed arrays */
    #ensureRows(): Row[] {
        if (this.#rows) {
            return this.#rows
        }
        const {data, series, xAxis, stacked} = this.chartAttrs
        const first = data.find(point => point.x !== undefined)?.x
        const kind: ScaleKind = xAxis?.type ?? (first === undefined ? "category" : first instanceof Date ? "time" : "linear")
        this.#xKind = kind
        let rows: Row[] = []
        if (kind === "category") {
            rows = data.map((point, index) => ({x: index, point, index}))
        } else {
            for (let index = 0; index < data.length; index++) {
                const x = Number(data[index].x)
                // A log axis has no position for zero or below, so such a point is left out
                if (Number.isFinite(x) && (kind !== "log" || x > 0)) {
                    rows.push({x, point: data[index], index})
                }
            }
            rows.sort((a, b) => a.x - b.x)
        }
        this.#rows = rows
        this.#values = series.map(s => {
            const column = new Float64Array(rows.length)
            for (let i = 0; i < rows.length; i++) {
                const value = rows[i].point.values[s.key]
                column[i] = value === undefined || !Number.isFinite(value) ? NaN : value
            }
            return column
        })
        if (!this.#seededHidden) {
            this.#seededHidden = true
            series.forEach((s, i) => {
                if (s.hidden) {
                    this.setEntryHidden(i, true)
                }
            })
        }
        this.#lows = []
        this.#highs = []
        const positive = {left: new Float64Array(rows.length), right: new Float64Array(rows.length)}
        const negative = {left: new Float64Array(rows.length), right: new Float64Array(rows.length)}
        series.forEach((s, seriesIndex) => {
            const low = new Float64Array(rows.length)
            const high = new Float64Array(rows.length)
            const side = s.yAxis === "right" ? "right" : "left"
            for (let i = 0; i < rows.length; i++) {
                const value = this.#values[seriesIndex][i]
                if (Number.isNaN(value) || this.isEntryHidden(seriesIndex)) {
                    low[i] = NaN
                    high[i] = NaN
                } else if (stacked) {
                    const running = value >= 0 ? positive[side] : negative[side]
                    low[i] = running[i]
                    high[i] = running[i] + value
                    running[i] = high[i]
                } else {
                    low[i] = 0
                    high[i] = value
                }
            }
            this.#lows.push(low)
            this.#highs.push(high)
        })
        this.#shownHighs = this.#highs
        this.#shownLows = this.#lows
        return rows
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        this.#ensureRows()
        const layout = this.#computeLayout(width, height)
        this.#layout = layout
        this.#cursorRow = -1
        this.#cursorLine = undefined
        this.#drawAxes(svg, layout)
        // Everything on the plot goes in one group, cut off at the plot's edge when anything could run
        // past it. Only then: a dot on the top value would otherwise lose its upper half.
        const plot = svgEl("g", {class: "vtc-chart-plot"})
        if (layout.clip) {
            const {box} = layout
            const clip = svgEl("clipPath", {id: this.#clipId})
            clip.appendChild(svgEl("rect", {x: box.left, y: box.top, width: box.width, height: box.height}))
            svg.appendChild(clip)
            plot.setAttribute("clip-path", `url(#${this.#clipId})`)
        }
        this.#drawBands(plot, layout)
        this.#drawMarks(plot, layout, width, height)
        this.#drawExtras(plot, layout)
        this.#drawAnnotations(plot, layout)
        svg.appendChild(plot)
        this.#drawSlider(svg, layout)
        this.#attachHover(svg, layout)
        this.#markInteractive(svg)
    }

    #xDomain(rows: Row[], hasBars: boolean): [number, number] {
        if (this.#xKind === "category") {
            return [-0.5, rows.length - 0.5]
        }
        const axis = this.chartAttrs.xAxis
        let min = rows[0]?.x ?? 0
        let max = rows[rows.length - 1]?.x ?? 1
        if (min === max) {
            min = this.#xKind === "log" ? min / 2 : min - 1
            max = this.#xKind === "log" ? max * 2 : max + 1
        } else if (hasBars || this.#hasKind("scatter")) {
            // Half a slot each side, so the first and last bar or point are not cut by the plot's edge
            const pad = this.#xKind === "log" ? 0 : Math.max(this.#smallestGap(rows) / 2, (max - min) * 0.02)
            min -= pad
            max += pad
        }
        return [axis?.min ?? min, axis?.max ?? max]
    }

    #smallestGap(rows: Row[]): number {
        let gap = Infinity
        for (let i = 1; i < rows.length; i++) {
            const delta = rows[i].x - rows[i - 1].x
            if (delta > 0 && delta < gap) {
                gap = delta
            }
        }
        return gap === Infinity ? 1 : gap
    }

    #hasKind(kind: ChartSeriesKind): boolean {
        return this.chartAttrs.series.some(s => this.seriesKind(s) === kind)
    }

    /** The extent of what series on one side reach, for the rows in view */
    #valueExtent(side: "left" | "right", start: number, end: number): [number, number] | undefined {
        const {series, stacked} = this.chartAttrs
        const log = (side === "left" ? this.chartAttrs.yAxis : this.chartAttrs.yAxisRight)?.type === "log"
        let min = Infinity
        let max = -Infinity
        const see = (value: number) => {
            if (!log || value > 0) {
                if (value < min) {min = value}
                if (value > max) {max = value}
            }
        }
        for (let s = 0; s < series.length; s++) {
            if ((series[s].yAxis === "right" ? "right" : "left") !== side) {
                continue
            }
            const highs = this.#highs[s]
            const lows = this.#lows[s]
            const rows = this.#rows as Row[]
            const key = series[s].key
            for (let i = start; i < end; i++) {
                if (!Number.isNaN(highs[i])) {
                    see(highs[i])
                    if (stacked) {
                        see(lows[i])
                    }
                    const error = errorRange(rows[i].point.errors?.[key])
                    if (error) {
                        see(highs[i] - error[0])
                        see(highs[i] + error[1])
                    }
                }
            }
        }
        // An annotation has to be in view to mean anything, and a threshold is often above the data
        for (const annotation of this.chartAttrs.annotations ?? []) {
            if (annotation.type === "point" && side === "left") {
                see(annotation.y)
            } else if (annotation.type !== "point" && (annotation.axis ?? "y") === (side === "left" ? "y" : "y2")) {
                if (annotation.type === "line") {
                    see(Number(annotation.value))
                } else {
                    see(Number(annotation.from))
                    see(Number(annotation.to))
                }
            }
        }
        return min === Infinity ? undefined : [min, max]
    }

    /** A value axis's domain and ticks. Its pixel range comes later, once the margins are known */
    #valueAxis(definition: ChartAxisType | undefined, side: "left" | "right", start: number, end: number, target: number): {min: number, max: number, ticks: number[], kind: ScaleKind} {
        const seen = this.#valueExtent(side, start, end) ?? [0, 1]
        const kind: ScaleKind = definition?.type === "log" ? "log" : "linear"
        const count = definition?.tickCount ?? target
        if (kind === "log") {
            const [low, high] = logDomain(definition?.min ?? seen[0], definition?.max ?? seen[1])
            const min = definition?.min ?? low
            const max = definition?.max ?? high
            return {min, max, ticks: logTicks(min, max), kind}
        }
        const hasBars = this.chartAttrs.series.some(s => this.seriesKind(s) === "bar")
        const beginAtZero = hasBars || (this.chartAttrs.beginAtZero ?? true)
        const floor = beginAtZero ? Math.min(0, seen[0]) : seen[0]
        const ceiling = beginAtZero ? Math.max(0, seen[1]) : seen[1]
        if (definition?.min !== undefined && definition?.max !== undefined) {
            return {min: definition.min, max: definition.max, ticks: ticksWithin(definition.min, definition.max, count), kind}
        }
        const ticks = niceTicks(definition?.min ?? floor, definition?.max ?? ceiling, count)
        const min = definition?.min ?? ticks[0]
        const max = definition?.max ?? ticks[ticks.length - 1]
        return {min, max, ticks: ticks.filter(tick => tick >= min && tick <= max), kind}
    }

    #computeLayout(width: number, height: number): Layout {
        const attrs = this.chartAttrs
        const rows = this.#ensureRows()
        const horizontal = attrs.horizontal ?? false
        const hasBars = this.#hasKind("bar")
        const view = this.#view
        // One row past each end of the view, so a line runs off the edge of the plot rather than stopping short
        const start = view ? Math.max(0, this.#lowerBound(rows, view.xMin) - 1) : 0
        const end = view ? Math.min(rows.length, this.#lowerBound(rows, view.xMax) + 2) : rows.length

        const leftDef: ChartAxisType | undefined = view?.yLeft ? {...attrs.yAxis, min: view.yLeft[0], max: view.yLeft[1]} : attrs.yAxis
        const rightDef: ChartAxisType | undefined = view?.yRight ? {...attrs.yAxisRight, min: view.yRight[0], max: view.yRight[1]} : attrs.yAxisRight
        const hasRight = attrs.series.some(s => s.yAxis === "right")
        const target = 5
        const left = this.#valueAxis(leftDef, "left", start, end, target)
        const right = hasRight ? this.#valueAxis(rightDef, "right", start, end, target) : undefined
        const leftFormat = leftDef?.format ?? ((value: number) => this.format(value))
        const rightFormat = rightDef?.format ?? ((value: number) => this.format(value))

        // Margins follow the longest label, so a large number is never clipped at the left edge
        const longest = (ticks: number[], format: (value: number) => string) =>
            ticks.reduce((n, tick) => Math.max(n, format(tick).length), 0)
        let marginLeft = MARGIN.left
        let marginRight = MARGIN.right
        if (horizontal) {
            const labels = rows.reduce((n, row) => Math.max(n, this.#rowTitle(row).length), 0)
            marginLeft = Math.min(width * 0.4, Math.max(MARGIN.left, labels * GLYPH + 16))
            marginRight = 24
        } else {
            marginLeft = Math.max(MARGIN.left, longest(left.ticks, leftFormat) * GLYPH + 14)
            if (right) {
                marginRight = Math.max(MARGIN.left, longest(right.ticks, rightFormat) * GLYPH + 14)
            }
        }
        const xTitle = horizontal ? leftDef?.title : attrs.xAxis?.title
        const yTitle = horizontal ? attrs.xAxis?.title : leftDef?.title
        if (yTitle) {
            marginLeft += AXIS_TITLE
        }
        if (right && rightDef?.title) {
            marginRight += AXIS_TITLE
        }
        const box: PlotBox = {
            left: marginLeft,
            top: MARGIN.top,
            width: Math.max(1, width - marginLeft - marginRight),
            height: Math.max(1, height - MARGIN.top - MARGIN.bottom - (xTitle ? AXIS_TITLE : 0) - (attrs.rangeSlider ? SLIDER_GAP + SLIDER_HEIGHT - 10 : 0)),
        }

        this.#fullX = this.#xDomain(rows, hasBars)
        const [xMin, xMax] = view ? [view.xMin, view.xMax] : this.#fullX
        const xLength = horizontal ? box.height : box.width
        const xFrom = horizontal ? box.top : box.left
        const reversed = attrs.xAxis?.reverse ?? false
        const xScale = this.#makeScale(this.#xKind, xMin, xMax, reversed ? xFrom + xLength : xFrom, reversed ? xFrom : xFrom + xLength)
        const x = this.#xAxis(xScale, rows, xLength, horizontal)

        const valueRange = (definition: ChartAxisType | undefined): [number, number] => {
            const range: [number, number] = horizontal ? [box.left, box.left + box.width] : [box.top + box.height, box.top]
            return definition?.reverse ? [range[1], range[0]] : range
        }
        const leftRange = valueRange(leftDef)
        const yLeft: Axis = {
            scale: this.#makeScale(left.kind, left.min, left.max, leftRange[0], leftRange[1]),
            ticks: left.ticks, format: leftFormat, definition: leftDef ?? {},
        }
        let yRight: Axis | undefined
        if (right) {
            const rightRange = valueRange(rightDef)
            yRight = {
                scale: this.#makeScale(right.kind, right.min, right.max, rightRange[0], rightRange[1]),
                ticks: right.ticks, format: rightFormat, definition: rightDef ?? {},
            }
        }

        // The pixel width of one slot: a category's band, or the tightest gap between numeric points
        let slot: number
        if (this.#xKind === "category") {
            slot = Math.abs(xScale.map(1) - xScale.map(0))
        } else {
            slot = xLength
            for (let i = start + 1; i < end; i++) {
                const gap = Math.abs(xScale.map(rows[i].x) - xScale.map(rows[i - 1].x))
                if (gap > 0 && gap < slot) {
                    slot = gap
                }
            }
        }
        const slider = attrs.rangeSlider && !horizontal ? {
            left: box.left, width: box.width, height: SLIDER_HEIGHT,
            top: box.top + box.height + SLIDER_GAP - 6 + (xTitle ? AXIS_TITLE : 0),
            scale: this.#makeScale(this.#xKind, this.#fullX[0], this.#fullX[1], box.left, box.left + box.width),
        } : undefined
        const fixed = [attrs.xAxis, leftDef, rightDef].some(axis => axis?.min !== undefined || axis?.max !== undefined)
        return {box, x, yLeft, yRight, start, end, slot, slider, clip: view !== undefined || fixed}
    }

    /** The first row at or past a value */
    #lowerBound(rows: Row[], value: number): number {
        let low = 0
        let high = rows.length
        while (low < high) {
            const middle = (low + high) >> 1
            if (rows[middle].x < value) {
                low = middle + 1
            } else {
                high = middle
            }
        }
        return low
    }

    #makeScale(kind: ScaleKind, min: number, max: number, from: number, to: number): Scale {
        return kind === "log" ? logScale(min, max, from, to) : linearScale(kind, min, max, from, to)
    }

    #xAxis(scale: Scale, rows: Row[], length: number, horizontal: boolean): Axis {
        const definition = this.chartAttrs.xAxis ?? {}
        const count = definition.tickCount
        if (this.#xKind === "category") {
            // One label per category if they fit, otherwise every nth. Thinned rather than rotated: a
            // rotated label is harder to read than an absent one, and the tooltip still names every point.
            const labels = rows.map(row => row.point.label ?? definition.format?.(row.x) ?? String(row.x))
            const widest = labels.reduce((n, label) => Math.max(n, label.length), 0)
            const perLabel = horizontal ? 18 : Math.max(28, widest * 8.5)
            const inView = Math.max(1, scale.max - scale.min)
            const stride = Math.max(1, Math.ceil(perLabel / Math.max(1, length / inView)))
            const ticks: number[] = []
            for (let index = Math.max(0, Math.ceil(scale.min)); index <= scale.max && index < rows.length; index++) {
                if (index % stride === 0) {
                    ticks.push(index)
                }
            }
            return {scale, ticks, format: (value) => labels[value] ?? "", definition}
        }
        const target = count ?? Math.max(2, Math.floor(length / 90))
        if (this.#xKind === "time") {
            const {ticks, format} = timeTicks(scale.min, scale.max, target, definition.utc ?? false)
            return {scale, ticks, format: definition.format ?? format, definition}
        }
        const format = definition.format ?? ((value: number) => this.format(value))
        return {
            scale, format, definition,
            ticks: this.#xKind === "log" ? logTicks(scale.min, scale.max) : ticksWithin(scale.min, scale.max, target),
        }
    }

    #drawAxes(svg: SVGElement, layout: Layout): void {
        const {box, x, yLeft, yRight} = layout
        const horizontal = this.chartAttrs.horizontal ?? false
        const bottom = box.top + box.height
        const right = box.left + box.width
        const tick = (className: string, px: number, py: number, text: string) => {
            const label = svgEl("text", {class: `vtc-chart-tick ${className}`, x: px, y: py})
            label.textContent = text
            svg.appendChild(label)
        }

        if (horizontal) {
            for (const value of yLeft.ticks) {
                const px = yLeft.scale.map(value)
                if (!yLeft.definition.hideGrid) {
                    svg.appendChild(svgEl("line", {class: "vtc-chart-gridline", x1: px, y1: box.top, x2: px, y2: bottom}))
                }
                tick("vtc-chart-tick-x", px, bottom + 18, yLeft.format(value))
            }
            for (const value of x.ticks) {
                tick("vtc-chart-tick-y", box.left - 8, x.scale.map(value), x.format(value))
            }
            const zero = yLeft.scale.map(Math.max(yLeft.scale.min, Math.min(0, yLeft.scale.max)))
            svg.appendChild(svgEl("line", {class: "vtc-chart-axis", x1: zero, y1: box.top, x2: zero, y2: bottom}))
            this.#axisTitles(svg, layout, yLeft.definition.title, x.definition.title)
            return
        }

        for (const value of yLeft.ticks) {
            const py = yLeft.scale.map(value)
            if (!yLeft.definition.hideGrid) {
                svg.appendChild(svgEl("line", {class: "vtc-chart-gridline", x1: box.left, y1: py, x2: right, y2: py}))
            }
            tick("vtc-chart-tick-y", box.left - 6, py, yLeft.format(value))
        }
        if (yRight) {
            // No grid lines of its own: two sets of lines at unrelated values read as noise
            for (const value of yRight.ticks) {
                tick("vtc-chart-tick-y2", right + 6, yRight.scale.map(value), yRight.format(value))
            }
        }
        if (x.scale.kind !== "category" && !x.definition.hideGrid) {
            for (const value of x.ticks) {
                const px = x.scale.map(value)
                svg.appendChild(svgEl("line", {class: "vtc-chart-gridline", x1: px, y1: box.top, x2: px, y2: bottom}))
            }
        }
        for (const value of x.ticks) {
            tick("vtc-chart-tick-x", x.scale.map(value), bottom + 18, x.format(value))
        }
        // The baseline sits at zero when zero is in view, so negative values hang below a real axis
        const baseline = yLeft.scale.kind === "log" || yLeft.scale.min > 0 || yLeft.scale.max < 0
            ? (yLeft.definition.reverse ? box.top : bottom)
            : yLeft.scale.map(0)
        svg.appendChild(svgEl("line", {class: "vtc-chart-axis", x1: box.left, y1: baseline, x2: right, y2: baseline}))
        this.#axisTitles(svg, layout, x.definition.title, yLeft.definition.title, yRight?.definition.title)
    }

    #axisTitles(svg: SVGElement, layout: Layout, bottomTitle?: string, leftTitle?: string, rightTitle?: string): void {
        const {box} = layout
        const midY = box.top + box.height / 2
        if (bottomTitle) {
            const title = svgEl("text", {class: "vtc-chart-axis-title", x: box.left + box.width / 2, y: box.top + box.height + 18 + AXIS_TITLE})
            title.textContent = bottomTitle
            svg.appendChild(title)
        }
        const vertical = (text: string, x: number) => {
            const title = svgEl("text", {class: "vtc-chart-axis-title", x, y: midY, transform: `rotate(-90 ${x} ${midY})`})
            title.textContent = text
            svg.appendChild(title)
        }
        if (leftTitle) {
            vertical(leftTitle, 12)
        }
        if (rightTitle) {
            vertical(rightTitle, Number(svg.getAttribute("width")) - 6)
        }
    }

    #axisFor(series: ChartSeriesType, layout: Layout): Axis {
        return series.yAxis === "right" && layout.yRight ? layout.yRight : layout.yLeft
    }

    /** Drawn back to front: bars first, then areas, then lines and points, so a line is never hidden */
    #drawMarks(svg: SVGElement, layout: Layout, width: number, height: number): void {
        const {series} = this.chartAttrs
        const canvas = this.chartAttrs.renderer === "canvas" ? this.#ensureCanvas(width, height) : undefined
        canvas?.begin(layout.box)
        const marks = svgEl("g", {class: "vtc-chart-marks"})
        const bars = series.map((s, i) => ({s, i})).filter(entry => this.seriesKind(entry.s) === "bar" && !this.isEntryHidden(entry.i))
        if (bars.length > 0) {
            this.#drawBars(marks, layout, bars, canvas)
        }
        series.forEach((s, i) => {
            const kind = this.seriesKind(s)
            if (kind === "line" || kind === "area") {
                this.#drawLine(marks, layout, s, i, kind === "area", canvas)
            } else if (kind === "scatter") {
                this.#drawPoints(marks, layout, s, i, canvas)
            }
        })
        svg.appendChild(marks)
    }

    #ensureCanvas(width: number, height: number): CanvasMarks {
        if (!this.#canvas) {
            this.#canvas = new CanvasMarks(width, height)
            this.underlay.appendChild(this.#canvas.element)
        } else if (this.#canvas.element.style.width !== `${width}px` || this.#canvas.element.style.height !== `${height}px`) {
            this.#canvas.resize(width, height)
        }
        return this.#canvas
    }

    /** A run of points thinned to what the plot's pixels can show */
    #thin(run: {top: PathPoint[], bottom: PathPoint[]}, layout: Layout): {top: PathPoint[], bottom: PathPoint[]} {
        const setting = this.chartAttrs.downsample
        if (setting === false) {
            return run
        }
        const threshold = setting?.threshold ?? Math.max(16, Math.floor(layout.box.width * 2))
        if (run.top.length <= threshold) {
            return run
        }
        const kept = setting?.algorithm === "min-max" ? minMax(run.top, threshold) : lttb(run.top, threshold)
        return {top: kept.map(i => run.top[i]), bottom: kept.map(i => run.bottom[i])}
    }

    /** The runs of connected points in one series: a gap ends one run, unless `spanGaps` bridges it */
    #runs(layout: Layout, seriesIndex: number, axis: Axis): {top: PathPoint[], bottom: PathPoint[]}[] {
        const rows = this.#rows as Row[]
        const highs = this.#shownHighs[seriesIndex]
        const lows = this.#shownLows[seriesIndex]
        const span = this.chartAttrs.spanGaps ?? false
        const runs: {top: PathPoint[], bottom: PathPoint[]}[] = []
        let current: {top: PathPoint[], bottom: PathPoint[]} | undefined
        const domainFloor = Math.max(axis.scale.min, Math.min(0, axis.scale.max))
        for (let i = layout.start; i < layout.end; i++) {
            if (Number.isNaN(highs[i])) {
                if (!span) {
                    current = undefined
                }
                continue
            }
            if (!current) {
                current = {top: [], bottom: []}
                runs.push(current)
            }
            const x = layout.x.scale.map(rows[i].x)
            current.top.push({x, y: axis.scale.map(highs[i])})
            // Unstacked, an area fills to the zero line, or to the axis when zero is out of view
            current.bottom.push({x, y: axis.scale.map(this.chartAttrs.stacked ? lows[i] : domainFloor)})
        }
        return runs
    }

    #drawLine(parent: SVGElement, layout: Layout, series: ChartSeriesType, seriesIndex: number, area: boolean, canvas: CanvasMarks | undefined): void {
        const color = seriesColor(seriesIndex, series.color)
        const curve: ChartCurve = series.curve ?? "linear"
        const axis = this.#axisFor(series, layout)
        const runs = this.#runs(layout, seriesIndex, axis)
        const showDots = this.chartAttrs.showDots ?? (layout.end - layout.start < 40)
        for (const whole of runs) {
            const run = this.#thin(whole, layout)
            if (area && run.top.length > 1) {
                if (canvas) {
                    canvas.area(run.top, run.bottom, color, curve)
                } else {
                    parent.appendChild(svgEl("path", {class: "vtc-chart-area", d: areaPath(run.top, run.bottom, curve), fill: color}))
                }
            }
            if (run.top.length > 1) {
                if (canvas) {
                    canvas.line(run.top, color, curve, series.dashed ?? false)
                } else {
                    parent.appendChild(svgEl("path", {
                        class: "vtc-chart-line", d: linePath(run.top, curve), stroke: color,
                        "stroke-dasharray": series.dashed ? "6 4" : undefined,
                    }))
                }
            }
            // A point with a gap on both sides has no line, so it gets a dot whatever showDots says
            if (showDots || run.top.length === 1) {
                if (canvas) {
                    canvas.circles(run.top.map(point => ({...point, r: 3})), color)
                } else {
                    for (const point of run.top) {
                        parent.appendChild(svgEl("circle", {class: "vtc-chart-dot", cx: point.x, cy: point.y, r: 3, fill: color}))
                    }
                }
            }
        }
    }

    #drawPoints(parent: SVGElement, layout: Layout, series: ChartSeriesType, seriesIndex: number, canvas: CanvasMarks | undefined): void {
        const rows = this.#rows as Row[]
        const color = seriesColor(seriesIndex, series.color)
        const axis = this.#axisFor(series, layout)
        const highs = this.#shownHighs[seriesIndex]
        const hoverMarks = this.#hoverMode() === "mark"
        const painted: {x: number, y: number, r: number}[] = []
        for (let i = layout.start; i < layout.end; i++) {
            if (Number.isNaN(highs[i])) {
                continue
            }
            const cx = layout.x.scale.map(rows[i].x)
            const cy = axis.scale.map(highs[i])
            if (canvas) {
                painted.push({x: cx, y: cy, r: this.pointRadius(rows[i].point, series)})
                continue
            }
            const circle = svgEl("circle", {class: "vtc-chart-point", cx, cy, r: this.pointRadius(rows[i].point, series), fill: color})
            if (hoverMarks) {
                this.addMark(circle, this.#markFor(i, series, seriesIndex, {left: cx, right: cx, y: cy}))
            }
            parent.appendChild(circle)
        }
        canvas?.circles(painted, color)
    }

    /** The overview under the plot: all the data, thinned, with the part in view marked */
    #drawSlider(svg: SVGElement, layout: Layout): void {
        const slider = layout.slider
        if (!slider) {
            return
        }
        const rows = this.#rows as Row[]
        const {left, top, width, height, scale} = slider
        svg.appendChild(svgEl("rect", {class: "vtc-chart-slider-track", x: left, y: top, width, height, rx: 2}))
        const first = this.chartAttrs.series.findIndex((_, i) => !this.isEntryHidden(i))
        if (first >= 0) {
            const highs = this.#highs[first]
            const seen: number[] = []
            for (let i = 0; i < highs.length; i++) {
                if (!Number.isNaN(highs[i])) {
                    seen.push(highs[i])
                }
            }
            const low = seen.reduce((n, value) => Math.min(n, value), Infinity)
            const high = seen.reduce((n, value) => Math.max(n, value), -Infinity)
            const toY = linearScale("linear", low, high === low ? low + 1 : high, top + height - 2, top + 2)
            const points: PathPoint[] = []
            for (let i = 0; i < highs.length; i++) {
                if (!Number.isNaN(highs[i])) {
                    points.push({x: scale.map(rows[i].x), y: toY.map(highs[i])})
                }
            }
            const kept = minMax(points, Math.floor(width))
            svg.appendChild(svgEl("path", {class: "vtc-chart-slider-line", d: linePath(kept.map(i => points[i]), "linear")}))
        }
        const a = scale.map(this.#view?.xMin ?? scale.min)
        const b = scale.map(this.#view?.xMax ?? scale.max)
        svg.appendChild(svgEl("rect", {class: "vtc-chart-slider-window", x: a, y: top, width: Math.max(2, b - a), height}))
        svg.appendChild(svgEl("rect", {class: "vtc-chart-slider-handle vtc-chart-slider-handle-min", x: a - 3, y: top, width: 6, height, rx: 2}))
        svg.appendChild(svgEl("rect", {class: "vtc-chart-slider-handle vtc-chart-slider-handle-max", x: b - 3, y: top, width: 6, height, rx: 2}))
    }

    /** A position on the x axis as given to an annotation: a value, a date, or a category's label */
    #annotationX(value: number | Date | string): number {
        if (typeof value === "string") {
            return (this.#rows as Row[]).findIndex(row => row.point.label === value)
        }
        return Number(value)
    }

    #annotationScale(layout: Layout, axis: "x" | "y" | "y2" | undefined): Scale {
        if (axis === "x") {
            return layout.x.scale
        }
        return axis === "y2" && layout.yRight ? layout.yRight.scale : layout.yLeft.scale
    }

    #annotationValue(axis: "x" | "y" | "y2" | undefined, value: number | Date | string): number {
        return axis === "x" ? this.#annotationX(value) : Number(value)
    }

    /** Under the marks, so a shaded range never dulls the data it is about */
    #drawBands(svg: SVGElement, layout: Layout): void {
        const {box} = layout
        const horizontal = this.chartAttrs.horizontal ?? false
        for (const annotation of this.chartAttrs.annotations ?? []) {
            if (annotation.type !== "band") {
                continue
            }
            const scale = this.#annotationScale(layout, annotation.axis)
            const from = scale.map(this.#annotationValue(annotation.axis, annotation.from))
            const to = scale.map(this.#annotationValue(annotation.axis, annotation.to))
            const acrossWidth = (annotation.axis === "x") !== horizontal
            const rect = acrossWidth
                ? {x: Math.min(from, to), y: box.top, width: Math.abs(to - from), height: box.height}
                : {x: box.left, y: Math.min(from, to), width: box.width, height: Math.abs(to - from)}
            svg.appendChild(svgEl("rect", {class: "vtc-chart-annotation-band", ...rect, fill: annotation.color, style: annotation.color ? `fill:${annotation.color}` : undefined}))
            if (annotation.label) {
                this.#annotationLabel(svg, annotation.label, rect.x + 4, rect.y + 12)
            }
        }
    }

    #annotationLabel(svg: SVGElement, text: string, x: number, y: number): void {
        const label = svgEl("text", {class: "vtc-chart-annotation-label", x, y})
        label.textContent = text
        svg.appendChild(label)
    }

    #drawAnnotations(svg: SVGElement, layout: Layout): void {
        const {box} = layout
        const horizontal = this.chartAttrs.horizontal ?? false
        for (const annotation of this.chartAttrs.annotations ?? []) {
            if (annotation.type === "line") {
                const position = this.#annotationScale(layout, annotation.axis).map(this.#annotationValue(annotation.axis, annotation.value))
                const style = annotation.color ? `stroke:${annotation.color}` : undefined
                const dash = annotation.dashed ? "6 4" : undefined
                if ((annotation.axis === "x") !== horizontal) {
                    svg.appendChild(svgEl("line", {class: "vtc-chart-annotation-line", x1: position, y1: box.top, x2: position, y2: box.top + box.height, style, "stroke-dasharray": dash}))
                    if (annotation.label) {
                        this.#annotationLabel(svg, annotation.label, position + 4, box.top + 12)
                    }
                } else {
                    svg.appendChild(svgEl("line", {class: "vtc-chart-annotation-line", x1: box.left, y1: position, x2: box.left + box.width, y2: position, style, "stroke-dasharray": dash}))
                    if (annotation.label) {
                        this.#annotationLabel(svg, annotation.label, box.left + 4, position - 4)
                    }
                }
            } else if (annotation.type === "point") {
                const cx = layout.x.scale.map(this.#annotationX(annotation.x))
                const cy = layout.yLeft.scale.map(annotation.y)
                svg.appendChild(svgEl("circle", {class: "vtc-chart-annotation-point", cx, cy, r: 5, style: annotation.color ? `fill:${annotation.color}` : undefined}))
                if (annotation.label) {
                    this.#annotationLabel(svg, annotation.label, cx + 8, cy - 8)
                }
            }
        }
    }

    /** Error bars, trend lines and value labels: everything that sits on top of a series' marks */
    #drawExtras(svg: SVGElement, layout: Layout): void {
        const attrs = this.chartAttrs
        const rows = this.#rows as Row[]
        const horizontal = attrs.horizontal ?? false
        const bars = attrs.series.filter((s, i) => this.seriesKind(s) === "bar" && !this.isEntryHidden(i))
        const group = Math.max(1, layout.slot * (1 - CATEGORY_PADDING))
        const thickness = attrs.stacked ? group : group / Math.max(1, bars.length)
        // One label every n rows, when a label wider than its slot would run into the next
        const inView = Math.max(1, layout.end - layout.start)
        const perRow = (horizontal ? layout.box.height : layout.box.width) / inView
        attrs.series.forEach((s, seriesIndex) => {
            if (this.isEntryHidden(seriesIndex)) {
                return
            }
            const axis = this.#axisFor(s, layout)
            const color = seriesColor(seriesIndex, s.color)
            const barIndex = bars.indexOf(s)
            const along = (row: number) => {
                const centre = layout.x.scale.map(rows[row].x)
                return barIndex >= 0 && !attrs.stacked ? centre - group / 2 + thickness * (barIndex + 0.5) : centre
            }
            const place = (a: number, v: number) => horizontal ? {x: v, y: a} : {x: a, y: v}
            for (let i = layout.start; i < layout.end; i++) {
                const error = errorRange(rows[i].point.errors?.[s.key])
                const high = this.#shownHighs[seriesIndex][i]
                if (!error || Number.isNaN(high)) {
                    continue
                }
                const a = along(i)
                const from = place(a, axis.scale.map(high - error[0]))
                const to = place(a, axis.scale.map(high + error[1]))
                const cap = Math.min(5, thickness / 3)
                const caps = horizontal
                    ? `M ${from.x} ${a - cap} V ${a + cap} M ${to.x} ${a - cap} V ${a + cap}`
                    : `M ${a - cap} ${from.y} H ${a + cap} M ${a - cap} ${to.y} H ${a + cap}`
                svg.appendChild(svgEl("path", {class: "vtc-chart-error", d: `M ${from.x} ${from.y} L ${to.x} ${to.y} ${caps}`, stroke: `color-mix(in srgb, ${color} 75%, var(--text))`}))
            }
            this.#drawTrend(svg, layout, s, seriesIndex, axis, color)
            if (attrs.showValues || s.showValues) {
                const format = this.#formatFor(s)
                let widest = 0
                for (let i = layout.start; i < layout.end; i++) {
                    const value = this.#values[seriesIndex][i]
                    if (!Number.isNaN(value)) {
                        widest = Math.max(widest, format(value).length)
                    }
                }
                const stride = horizontal ? Math.max(1, Math.ceil(14 / Math.max(1, perRow))) : Math.max(1, Math.ceil((widest * GLYPH + 4) / Math.max(1, perRow)))
                for (let i = layout.start; i < layout.end; i += stride) {
                    const value = this.#values[seriesIndex][i]
                    const high = this.#shownHighs[seriesIndex][i]
                    if (Number.isNaN(value) || Number.isNaN(high)) {
                        continue
                    }
                    const position = axis.scale.map(high)
                    const a = along(i)
                    // A stacked segment's value sits in its middle, since the end of it is the next segment
                    const middle = attrs.stacked ? axis.scale.map((high + this.#shownLows[seriesIndex][i]) / 2) : position
                    const offset = attrs.stacked ? 0 : (value >= 0 ? -6 : 6)
                    const label = svgEl("text", horizontal
                        ? {class: "vtc-chart-value-label", x: middle - offset * 2, y: a, "dominant-baseline": "middle", "text-anchor": attrs.stacked ? "middle" : value >= 0 ? "start" : "end"}
                        : {class: "vtc-chart-value-label", x: a, y: middle + offset, "dominant-baseline": attrs.stacked ? "middle" : value >= 0 ? "auto" : "hanging"})
                    label.textContent = format(value)
                    svg.appendChild(label)
                }
            }
        })
    }

    #drawTrend(svg: SVGElement, layout: Layout, series: ChartSeriesType, seriesIndex: number, axis: Axis, color: string): void {
        if (!series.trendline) {
            return
        }
        const rows = this.#rows as Row[]
        const xs: number[] = []
        const ys: number[] = []
        for (let i = layout.start; i < layout.end; i++) {
            const value = this.#values[seriesIndex][i]
            if (!Number.isNaN(value)) {
                xs.push(rows[i].x)
                ys.push(value)
            }
        }
        if (xs.length < 2) {
            return
        }
        const points: PathPoint[] = []
        if (series.trendline === "linear") {
            const fit = linearFit(xs, ys)
            for (const x of [xs[0], xs[xs.length - 1]]) {
                points.push({x: layout.x.scale.map(x), y: axis.scale.map(fit.slope * x + fit.intercept)})
            }
        } else {
            const averaged = movingAverage(ys, series.trendline.window)
            averaged.forEach((y, i) => {
                if (y !== undefined) {
                    points.push({x: layout.x.scale.map(xs[i]), y: axis.scale.map(y)})
                }
            })
        }
        svg.appendChild(svgEl("path", {class: "vtc-chart-trend", d: linePath(points, "linear"), stroke: color}))
    }

    /** A scatter point's radius. `BubbleChart` overrides it */
    protected pointRadius(_point: ChartPointType, _series: ChartSeriesType): number {
        return 4
    }

    #markFor(row: number, series: ChartSeriesType, seriesIndex: number, anchor: {left: number, right: number, y: number}) {
        const rows = this.#rows as Row[]
        const value = this.#values[seriesIndex][row]
        const title = this.#rowTitle(rows[row])
        return {
            title, anchor,
            rows: [{
                label: series.label ?? series.key,
                value: this.#valueText(series, value, rows[row]),
                color: seriesColor(seriesIndex, series.color),
            }],
            detail: {label: title, index: rows[row].index, series: series.key, value},
        }
    }

    /** A value as the tooltip says it, with its uncertainty when it has one */
    #valueText(series: ChartSeriesType, value: number, row: Row): string {
        const format = this.#formatFor(series)
        const error = errorRange(row.point.errors?.[series.key])
        if (!error) {
            return format(value)
        }
        return error[0] === error[1] ? `${format(value)} ± ${format(error[0])}` : `${format(value)} (-${format(error[0])} +${format(error[1])})`
    }

    #drawBars(parent: SVGElement, layout: Layout, bars: {s: ChartSeriesType, i: number}[], canvas: CanvasMarks | undefined): void {
        const rows = this.#rows as Row[]
        const {stacked, horizontal} = this.chartAttrs
        const hoverMarks = this.#hoverMode() === "mark"
        const group = Math.max(1, layout.slot * (1 - CATEGORY_PADDING))
        const thickness = stacked ? group : group / bars.length
        for (let rowIndex = layout.start; rowIndex < layout.end; rowIndex++) {
            const centre = layout.x.scale.map(rows[rowIndex].x)
            bars.forEach((bar, barIndex) => {
                const high = this.#shownHighs[bar.i][rowIndex]
                if (Number.isNaN(high)) {
                    return
                }
                const axis = this.#axisFor(bar.s, layout)
                const low = this.#shownLows[bar.i][rowIndex]
                // A log axis has no zero, so its bars rise from the axis's own low end
                const from = axis.scale.map(axis.scale.kind === "log" ? axis.scale.min : low)
                const to = axis.scale.map(high)
                const along = stacked ? centre - group / 2 : centre - group / 2 + thickness * barIndex
                const across = Math.max(1, thickness - (stacked ? 0 : 1))
                const length = Math.abs(to - from)
                const color = seriesColor(bar.i, bar.s.color)
                if (canvas) {
                    if (horizontal) {
                        canvas.rect(Math.min(from, to), along, length, across, color)
                    } else {
                        canvas.rect(along, Math.min(from, to), across, length, color)
                    }
                    return
                }
                const rect = horizontal
                    ? svgEl("rect", {class: "vtc-chart-bar", x: Math.min(from, to), y: along, width: length, height: across, fill: color, rx: 2})
                    : svgEl("rect", {class: "vtc-chart-bar", x: along, y: Math.min(from, to), width: across, height: length, fill: color, rx: 2})
                if (hoverMarks) {
                    // The bar's own span, so the tooltip never lands on the bar it is describing
                    this.addMark(rect, this.#markFor(rowIndex, bar.s, bar.i, horizontal
                        ? {left: Math.min(from, to), right: Math.max(from, to), y: along + across / 2}
                        : {left: along, right: along + thickness, y: Math.min(from, to)}))
                }
                parent.appendChild(rect)
            })
        }
    }

    /**
     * One transparent rectangle over the whole plot, tracking the nearest row, rather than a hit target
     * per point: a pointer only has to be near the right column, not on a 2px line.
     *
     * The listeners go on the drawing's host, which survives a redraw, rather than on this rect.
     */
    #attachHover(svg: SVGElement, layout: Layout): void {
        const mode = this.#hoverMode()
        if (!this.#listening) {
            this.#listening = true
            const host = this.drawingHost
            host.addEventListener("pointerdown", this.#onPointerDown)
            host.addEventListener("pointermove", this.#onPointerMove)
            host.addEventListener("pointerup", this.#onPointerUp)
            host.addEventListener("pointercancel", this.#onPointerUp)
            host.addEventListener("pointerleave", this.#onPointerLeave)
            host.addEventListener("dblclick", this.#onDoubleClick)
            // Not passive: holding the page still is the point of a zoom on the wheel
            host.addEventListener("wheel", this.#onWheel, {passive: false})
        }
        if (mode !== "index" && mode !== "nearest") {
            return
        }
        const {box} = layout
        if (mode === "index") {
            const line = svgEl("line", {class: "vtc-chart-gridline", y1: box.top, y2: box.top + box.height})
            line.setAttribute("visibility", "hidden")
            svg.appendChild(line)
            this.#cursorLine = line
        }
        this.#crosshair = undefined
        if (this.chartAttrs.crosshair) {
            const hiddenEl = (tag: string, className: string) => {
                const element = svgEl(tag, {class: className, visibility: "hidden"})
                svg.appendChild(element)
                return element
            }
            this.#crosshair = {
                horizontal: hiddenEl("line", "vtc-chart-crosshair"),
                vertical: hiddenEl("line", "vtc-chart-crosshair"),
                yBadge: hiddenEl("rect", "vtc-chart-crosshair-badge"),
                yText: hiddenEl("text", "vtc-chart-crosshair-text"),
                xBadge: hiddenEl("rect", "vtc-chart-crosshair-badge"),
                xText: hiddenEl("text", "vtc-chart-crosshair-text"),
            }
        }
        svg.appendChild(svgEl("rect", {class: "vtc-chart-hit", x: box.left, y: box.top, width: box.width, height: box.height}))
    }

    /**
     * Puts the crosshair at the pointer and reads both axes off there. The elements are pooled and their
     * attributes rewritten, since this runs for every pointer move.
     */
    #moveCrosshair(layout: Layout, x: number, y: number): void {
        const parts = this.#crosshair
        if (!parts) {
            return
        }
        const {box} = layout
        const inside = x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height
        const visibility = inside ? "visible" : "hidden"
        for (const part of Object.values(parts)) {
            part.setAttribute("visibility", visibility)
        }
        if (!inside) {
            return
        }
        const set = (element: SVGElement, values: Record<string, number>) => {
            for (const name of Object.keys(values)) {
                element.setAttribute(name, String(values[name]))
            }
        }
        set(parts.horizontal, {x1: box.left, x2: box.left + box.width, y1: y, y2: y})
        set(parts.vertical, {x1: x, x2: x, y1: box.top, y2: box.top + box.height})
        const yLabel = layout.yLeft.format(Number(layout.yLeft.scale.invert(y).toPrecision(4)))
        const yWidth = yLabel.length * GLYPH + 8
        set(parts.yBadge, {x: box.left - yWidth, y: y - 9, width: yWidth, height: 18, rx: 2})
        set(parts.yText, {x: box.left - yWidth / 2, y})
        parts.yText.textContent = yLabel
        const row = (this.#rows as Row[])[this.#nearestRow(layout, x)]
        const xLabel = row ? this.#rowTitle(row) : ""
        const xWidth = xLabel.length * GLYPH + 8
        const bottom = box.top + box.height
        set(parts.xBadge, {x: x - xWidth / 2, y: bottom + 2, width: xWidth, height: 18, rx: 2})
        set(parts.xText, {x, y: bottom + 11})
        parts.xText.textContent = xLabel
    }

    #hideCrosshair(): void {
        if (this.#crosshair) {
            for (const part of Object.values(this.#crosshair)) {
                part.setAttribute("visibility", "hidden")
            }
        }
    }

    /** Another chart in the group moved its cursor: show the same x here, or clear when it left */
    #showSyncedCursor(x: number | undefined): void {
        const layout = this.#layout
        if (!layout) {
            return
        }
        if (x === undefined) {
            this.#clearCursor()
            this.tooltip.hide()
            return
        }
        const pixel = layout.x.scale.map(x)
        if (pixel < layout.box.left || pixel > layout.box.left + layout.box.width) {
            return
        }
        this.#showRow(layout, this.#nearestRow(layout, pixel), pixel, layout.box.top + layout.box.height / 2)
    }

    /** The row whose x is closest to a pixel. `#rows` is sorted, so this needn't look at them all */
    #nearestRow(layout: Layout, pixel: number): number {
        const rows = this.#rows as Row[]
        const value = layout.x.scale.invert(pixel)
        let low = layout.start
        let high = layout.end - 1
        while (low < high) {
            const middle = (low + high) >> 1
            if (rows[middle].x < value) {
                low = middle + 1
            } else {
                high = middle
            }
        }
        if (low > layout.start && Math.abs(rows[low - 1].x - value) <= Math.abs(rows[low].x - value)) {
            return low - 1
        }
        return low
    }

    /** A pointer event's position in the drawing's own coordinates */
    #position(event: MouseEvent): {x: number, y: number} {
        const rect = (this.currentSvg as SVGElement).getBoundingClientRect()
        return {x: event.clientX - rect.left, y: event.clientY - rect.top}
    }

    #inPlot(layout: Layout, x: number, y: number): boolean {
        const {box} = layout
        return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height
    }

    /** Keeps an x range within the data and no tighter than the closest two points */
    #clampX(min: number, max: number): [number, number] {
        const [fullMin, fullMax] = this.#fullX
        const rows = this.#rows as Row[]
        const tightest = this.#xKind === "category" ? 1 : this.#smallestGap(rows)
        let low = min
        let high = max
        if (high - low < tightest) {
            const middle = (low + high) / 2
            low = middle - tightest / 2
            high = middle + tightest / 2
        }
        if (high - low >= fullMax - fullMin) {
            return [fullMin, fullMax]
        }
        if (low < fullMin) {
            high += fullMin - low
            low = fullMin
        }
        if (high > fullMax) {
            low -= high - fullMax
            high = fullMax
        }
        return [low, high]
    }

    /** The view that `from`-`to` pixels on each axis would show, read off the current scales */
    #viewFromPixels(layout: Layout, x0: number, x1: number, y0: number, y1: number, zoomY: boolean): View {
        const [xMin, xMax] = this.#clampX(layout.x.scale.invert(x0), layout.x.scale.invert(x1))
        const yOf = (axis: Axis | undefined): [number, number] | undefined => {
            if (!zoomY || !axis) {
                return undefined
            }
            const a = axis.scale.invert(y0)
            const b = axis.scale.invert(y1)
            return [Math.min(a, b), Math.max(a, b)]
        }
        return {xMin, xMax, yLeft: yOf(layout.yLeft) ?? this.#view?.yLeft, yRight: yOf(layout.yRight) ?? this.#view?.yRight}
    }

    /** Zooms by `factor` around a pixel, on the axes `zoom` allows */
    #zoomAround(layout: Layout, x: number, y: number, factor: number): void {
        const {box} = layout
        const zoom = this.chartAttrs.zoom ?? "x"
        const zoomX = zoom !== "y"
        const zoomY = zoom !== "x"
        const x0 = zoomX ? x - (x - box.left) * factor : box.left
        const x1 = zoomX ? x + (box.left + box.width - x) * factor : box.left + box.width
        const y0 = zoomY ? y - (y - box.top) * factor : box.top
        const y1 = zoomY ? y + (box.top + box.height - y) * factor : box.top + box.height
        const next = this.#viewFromPixels(layout, x0, x1, y0, y1, zoomY)
        const [fullMin, fullMax] = this.#fullX
        // Zoomed back out to everything, which is not a view at all: the y axis goes back to following the data
        if (next.xMin <= fullMin && next.xMax >= fullMax && factor > 1) {
            this.#setView(undefined, true)
        } else {
            this.#setView(next, true)
        }
    }

    #onWheel = (event: WheelEvent) => {
        const layout = this.#layout
        if (!layout || !this.currentSvg || !this.#canZoom()) {
            return
        }
        const {x, y} = this.#position(event)
        if (!this.#inPlot(layout, x, y)) {
            return
        }
        // A trackpad pinch arrives as a wheel event with ctrlKey set
        if ((this.chartAttrs.wheelZoom ?? "modifier") === "modifier" && !event.ctrlKey && !event.metaKey) {
            return
        }
        event.preventDefault()
        this.#zoomAround(layout, x, y, Math.exp(event.deltaY * 0.002))
    }

    #onDoubleClick = () => {
        if (this.#view) {
            this.#setView(undefined, true)
        }
    }

    #onPointerDown = (event: PointerEvent) => {
        const layout = this.#layout
        if (!layout || !this.currentSvg || event.button !== 0) {
            return
        }
        const {x, y} = this.#position(event)
        const target = (event.target as Element).getAttribute?.("class") ?? ""
        if (event.pointerType === "touch") {
            this.#touches.set(event.pointerId, {x, y})
            if (this.#touches.size === 2 && this.#canZoom()) {
                const [a, b] = [...this.#touches.values()]
                this.#pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
                this.#drag = undefined
                return
            }
        }
        let drag: Drag | undefined
        const [fullMin, fullMax] = this.#fullX
        const xMin = this.#view?.xMin ?? fullMin
        const xMax = this.#view?.xMax ?? fullMax
        if (target.includes("vtc-chart-slider-handle-min")) {
            drag = {kind: "slider-min", startX: x, xMin, xMax, moved: false}
        } else if (target.includes("vtc-chart-slider-handle-max")) {
            drag = {kind: "slider-max", startX: x, xMin, xMax, moved: false}
        } else if (target.includes("vtc-chart-slider-window")) {
            drag = {kind: "slider-window", startX: x, xMin, xMax, moved: false}
        } else if (this.#inPlot(layout, x, y)) {
            if (this.#canBrush() && !(event.shiftKey && this.#canZoom())) {
                drag = {kind: "brush", startX: x, startY: y, x, y, moved: false}
            } else if (this.#canZoom()) {
                drag = {kind: "pan", startX: x, startY: y, moved: false, view: {x: layout.x.scale, y: layout.yLeft.scale, yRight: layout.yRight?.scale}}
            }
        }
        if (drag) {
            this.#drag = drag
            try {
                this.drawingHost.setPointerCapture(event.pointerId)
            } catch {
                // The pointer has already gone, so there is nothing to keep hold of
            }
            this.tooltip.hide()
        }
    }

    #continueDrag(layout: Layout, drag: Drag, x: number, y: number): void {
        drag.moved ||= Math.abs(x - drag.startX) > 3
        if (drag.kind === "pan") {
            const zoom = this.chartAttrs.zoom ?? "x"
            const dx = zoom === "y" ? 0 : x - drag.startX
            const dy = zoom === "x" ? 0 : y - drag.startY
            drag.moved ||= Math.abs(dy) > 3
            const {box} = layout
            const span = (scale: Scale, a: number, b: number): [number, number] => {
                const low = scale.invert(a)
                const high = scale.invert(b)
                return [Math.min(low, high), Math.max(low, high)]
            }
            const [xMin, xMax] = this.#clampX(drag.view.x.invert(box.left - dx), drag.view.x.invert(box.left + box.width - dx))
            const yLeft = zoom !== "x" ? span(drag.view.y, box.top - dy, box.top + box.height - dy) : this.#view?.yLeft
            const yRight = zoom !== "x" && drag.view.yRight ? span(drag.view.yRight, box.top - dy, box.top + box.height - dy) : this.#view?.yRight
            this.#setView({xMin, xMax, yLeft, yRight}, true)
        } else if (drag.kind === "brush") {
            drag.x = x
            drag.y = y
            this.#showBrush(layout, drag)
        } else if (layout.slider) {
            const scale = layout.slider.scale
            const delta = scale.invert(x) - scale.invert(drag.startX)
            const [fullMin, fullMax] = this.#fullX
            let xMin = drag.xMin
            let xMax = drag.xMax
            if (drag.kind === "slider-window") {
                xMin += delta
                xMax += delta
            } else if (drag.kind === "slider-min") {
                xMin = Math.min(xMin + delta, xMax)
            } else {
                xMax = Math.max(xMax + delta, xMin)
            }
            const [low, high] = this.#clampX(xMin, xMax)
            this.#setView(low <= fullMin && high >= fullMax ? undefined : {...this.#view, xMin: low, xMax: high}, true)
        }
    }

    /** The rectangle a brush covers. A plain `brush` is the whole height of the plot */
    #brushBounds(layout: Layout, drag: {startX: number, startY: number, x: number, y: number}) {
        const {box} = layout
        const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
        const x0 = clamp(Math.min(drag.startX, drag.x), box.left, box.left + box.width)
        const x1 = clamp(Math.max(drag.startX, drag.x), box.left, box.left + box.width)
        if (this.chartAttrs.brush !== "xy") {
            return {x0, x1, y0: box.top, y1: box.top + box.height}
        }
        return {
            x0, x1,
            y0: clamp(Math.min(drag.startY, drag.y), box.top, box.top + box.height),
            y1: clamp(Math.max(drag.startY, drag.y), box.top, box.top + box.height),
        }
    }

    #showBrush(layout: Layout, drag: {startX: number, startY: number, x: number, y: number}): void {
        const svg = this.currentSvg
        if (!svg) {
            return
        }
        if (!this.#brushRect || this.#brushRect.ownerSVGElement !== svg) {
            this.#brushRect = svgEl("rect", {class: "vtc-chart-brush"})
            svg.appendChild(this.#brushRect)
        }
        const bounds = this.#brushBounds(layout, drag)
        this.#brushRect.setAttribute("x", String(bounds.x0))
        this.#brushRect.setAttribute("y", String(bounds.y0))
        this.#brushRect.setAttribute("width", String(bounds.x1 - bounds.x0))
        this.#brushRect.setAttribute("height", String(bounds.y1 - bounds.y0))
    }

    #finishBrush(layout: Layout, drag: {startX: number, startY: number, x: number, y: number}): void {
        this.#brushRect?.remove()
        this.#brushRect = undefined
        const bounds = this.#brushBounds(layout, drag)
        const a = layout.x.scale.invert(bounds.x0)
        const b = layout.x.scale.invert(bounds.x1)
        const xMin = Math.min(a, b)
        const xMax = Math.max(a, b)
        const whole = this.chartAttrs.brush !== "xy"
        const yA = layout.yLeft.scale.invert(bounds.y0)
        const yB = layout.yLeft.scale.invert(bounds.y1)
        const yMin = whole ? undefined : Math.min(yA, yB)
        const yMax = whole ? undefined : Math.max(yA, yB)
        const rows = this.#rows as Row[]
        const points: ChartPointType[] = []
        for (let i = this.#lowerBound(rows, xMin); i < rows.length && rows[i].x <= xMax; i++) {
            if (whole) {
                points.push(rows[i].point)
            } else if (this.chartAttrs.series.some((_, s) => {
                const value = this.#highs[s][i]
                return !Number.isNaN(value) && value >= (yMin as number) && value <= (yMax as number)
            })) {
                points.push(rows[i].point)
            }
        }
        this.chartAttrs.onBrush?.({xMin, xMax, yMin, yMax, points})
        if (this.chartAttrs.brushZoom ?? this.#canZoom()) {
            const [low, high] = this.#clampX(xMin, xMax)
            const yLeft = whole || yMin === undefined || yMax === undefined ? this.#view?.yLeft : [yMin, yMax] as [number, number]
            this.#setView({xMin: low, xMax: high, yLeft, yRight: this.#view?.yRight}, true)
        }
    }

    #onPointerUp = (event: PointerEvent) => {
        this.#touches.delete(event.pointerId)
        const drag = this.#drag
        this.#drag = undefined
        if (!drag) {
            return
        }
        if (drag.moved) {
            this.swallowNextClick()
            const layout = this.#layout
            if (drag.kind === "brush" && layout) {
                this.#finishBrush(layout, drag)
            }
        } else if (drag.kind === "brush") {
            this.#brushRect?.remove()
            this.#brushRect = undefined
        }
    }

    #continuePinch(layout: Layout, event: PointerEvent): boolean {
        const known = this.#touches.get(event.pointerId)
        if (!known || this.#touches.size !== 2 || !this.#canZoom()) {
            return false
        }
        const position = this.#position(event)
        known.x = position.x
        known.y = position.y
        const [a, b] = [...this.#touches.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        if (this.#pinchDistance > 0 && distance > 0) {
            this.#zoomAround(layout, (a.x + b.x) / 2, (a.y + b.y) / 2, this.#pinchDistance / distance)
        }
        this.#pinchDistance = distance
        return true
    }

    #onPointerMove = (event: PointerEvent) => {
        const layout = this.#layout
        const svg = this.currentSvg
        if (!layout || !svg) {
            return
        }
        if (event.pointerType === "touch" && this.#continuePinch(layout, event)) {
            return
        }
        if (this.#drag) {
            const position = this.#position(event)
            this.#continueDrag(layout, this.#drag, position.x, position.y)
            return
        }
        if ((event.target as Element).getAttribute("class") !== "vtc-chart-hit") {
            return
        }
        const rect = svg.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        this.#moveCrosshair(layout, x, y)
        if ((this.chartAttrs.hover ?? this.defaultHover()) === "nearest") {
            this.#showNearest(layout, x, y)
        } else {
            const row = this.#nearestRow(layout, x)
            this.#showRow(layout, row, x, y)
            this.#broadcastCursor?.((this.#rows as Row[])[row]?.x)
        }
    }

    #onPointerLeave = () => {
        this.#clearCursor()
        this.#hideCrosshair()
        this.tooltip.hide()
        this.#broadcastCursor?.(undefined)
    }

    #clearCursor(): void {
        this.#cursorRow = -1
        this.#cursorLine?.setAttribute("visibility", "hidden")
    }

    #showRow(layout: Layout, rowIndex: number, x: number, y: number): void {
        const rows = this.#rows as Row[]
        const row = rows[rowIndex]
        if (!row) {
            return
        }
        const centre = layout.x.scale.map(row.x)
        // Only touch the marker when it actually moves to a different row - a pointer wandering
        // inside one column would otherwise rewrite three attributes per event.
        if (rowIndex !== this.#cursorRow) {
            this.#cursorRow = rowIndex
            this.#cursorLine?.setAttribute("visibility", "visible")
            this.#cursorLine?.setAttribute("x1", String(centre))
            this.#cursorLine?.setAttribute("x2", String(centre))
        }
        const tips: TooltipRow[] = []
        this.chartAttrs.series.forEach((s, i) => {
            const value = this.#values[i][rowIndex]
            if (!Number.isNaN(value) && !this.isEntryHidden(i)) {
                // Each series' own value, never its stacked running total - "this series contributed
                // 12" is the fact a reader wants, not "the stack reached 40".
                tips.push({label: s.label ?? s.key, value: this.#valueText(s, value, row), color: seriesColor(i, s.color)})
            }
        })
        // Anchored on the pointer, not on the centre: that keeps the offset constant as the cursor
        // moves. The span to clear is everything between the cursor and the marker line, which can
        // sit either side of the pointer, and covering it hides which row is selected.
        this.showTooltip(this.#rowTitle(row), tips, {left: Math.min(x, centre), right: Math.max(x, centre), y})
    }

    /** The rows within `pixels` of an x, or every row in view if there are none that close */
    #rowsNear(layout: Layout, x: number, pixels: number): [number, number] {
        const rows = this.#rows as Row[]
        const a = layout.x.scale.invert(x - pixels)
        const b = layout.x.scale.invert(x + pixels)
        const start = this.#lowerBound(rows, Math.min(a, b))
        let end = start
        while (end < rows.length && rows[end].x <= Math.max(a, b)) {
            end++
        }
        return end > start ? [start, end] : [layout.start, layout.end]
    }

    #showNearest(layout: Layout, x: number, y: number): void {
        const rows = this.#rows as Row[]
        const {series} = this.chartAttrs
        let best = Infinity
        let bestRow = -1
        let bestSeries = -1
        // Only rows within reach of the pointer, since this runs for every move and the rows are sorted.
        // Past that a point is not what the reader is pointing at, unless nothing at all is closer.
        const reach = this.#rowsNear(layout, x, 48)
        for (let s = 0; s < series.length; s++) {
            const axis = this.#axisFor(series[s], layout)
            const highs = this.#shownHighs[s]
            for (let i = reach[0]; i < reach[1]; i++) {
                if (Number.isNaN(highs[i])) {
                    continue
                }
                const dx = layout.x.scale.map(rows[i].x) - x
                const dy = axis.scale.map(highs[i]) - y
                const distance = dx * dx + dy * dy
                if (distance < best) {
                    best = distance
                    bestRow = i
                    bestSeries = s
                }
            }
        }
        if (bestRow < 0) {
            return
        }
        const s = series[bestSeries]
        const cx = layout.x.scale.map(rows[bestRow].x)
        const mark = this.#markFor(bestRow, s, bestSeries, {left: Math.min(x, cx), right: Math.max(x, cx), y})
        this.#cursorRow = bestRow
        this.showTooltip(mark.title, mark.rows, mark.anchor)
    }

    protected override clickDetail(event: MouseEvent): ChartPointDetail | undefined {
        const layout = this.#layout
        const svg = this.currentSvg
        const rows = this.#rows
        if (!layout || !svg || !rows || (event.target as Element).getAttribute("class") !== "vtc-chart-hit") {
            return undefined
        }
        const row = rows[this.#nearestRow(layout, event.clientX - svg.getBoundingClientRect().left)]
        return row ? {label: this.#rowTitle(row), index: row.index} : undefined
    }
}
