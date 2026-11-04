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
import { joinCursorGroup } from "./cursor-sync.ts"
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
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

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
}

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
    #leaveCursorGroup: (() => void) | undefined
    /** Tells the rest of the group where the cursor went, or that it left */
    #broadcastCursor: ((x: number | undefined) => void) | undefined

    override mount() {
        super.mount()
        const group = this.chartAttrs.syncGroup
        if (group !== undefined) {
            const member = joinCursorGroup(group, (x) => this.#showSyncedCursor(x))
            this.#broadcastCursor = member.broadcast
            this.#leaveCursorGroup = member.leave
        }
    }

    override unmount() {
        super.unmount()
        this.#leaveCursorGroup?.()
        this.#leaveCursorGroup = undefined
        this.#broadcastCursor = undefined
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
        return {
            columns: ["", ...series.map(s => s.label ?? s.key)],
            // Each series' own value, not the stacked running total - the same choice the tooltip
            // makes, so what is read aloud matches what a sighted reader is told. A gap is an empty
            // cell, which a screen reader announces as one.
            rows: rows.map((row, position) => [this.#rowTitle(row), ...series.map((s, i) => {
                const value = this.#values[i][position]
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
        this.#drawBands(svg, layout)
        this.#drawMarks(svg, layout)
        this.#drawExtras(svg, layout)
        this.#drawAnnotations(svg, layout)
        this.#attachHover(svg, layout)
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
        const start = 0
        const end = rows.length

        const leftDef = attrs.yAxis
        const rightDef = attrs.yAxisRight
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
            height: Math.max(1, height - MARGIN.top - MARGIN.bottom - (xTitle ? AXIS_TITLE : 0)),
        }

        const [xMin, xMax] = this.#xDomain(rows, hasBars)
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
        return {box, x, yLeft, yRight, start, end, slot}
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
    #drawMarks(svg: SVGElement, layout: Layout): void {
        const {series} = this.chartAttrs
        const marks = svgEl("g", {class: "vtc-chart-marks"})
        const bars = series.map((s, i) => ({s, i})).filter(entry => this.seriesKind(entry.s) === "bar" && !this.isEntryHidden(entry.i))
        if (bars.length > 0) {
            this.#drawBars(marks, layout, bars)
        }
        series.forEach((s, i) => {
            const kind = this.seriesKind(s)
            if (kind === "line" || kind === "area") {
                this.#drawLine(marks, layout, s, i, kind === "area")
            } else if (kind === "scatter") {
                this.#drawPoints(marks, layout, s, i)
            }
        })
        svg.appendChild(marks)
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

    #drawLine(parent: SVGElement, layout: Layout, series: ChartSeriesType, seriesIndex: number, area: boolean): void {
        const color = seriesColor(seriesIndex, series.color)
        const curve: ChartCurve = series.curve ?? "linear"
        const axis = this.#axisFor(series, layout)
        const runs = this.#runs(layout, seriesIndex, axis)
        const showDots = this.chartAttrs.showDots ?? (layout.end - layout.start < 40)
        for (const run of runs) {
            if (area && run.top.length > 1) {
                parent.appendChild(svgEl("path", {class: "vtc-chart-area", d: areaPath(run.top, run.bottom, curve), fill: color}))
            }
            if (run.top.length > 1) {
                parent.appendChild(svgEl("path", {
                    class: "vtc-chart-line", d: linePath(run.top, curve), stroke: color,
                    "stroke-dasharray": series.dashed ? "6 4" : undefined,
                }))
            }
            // A point with a gap on both sides has no line, so it gets a dot whatever showDots says
            if (showDots || run.top.length === 1) {
                for (const point of run.top) {
                    parent.appendChild(svgEl("circle", {class: "vtc-chart-dot", cx: point.x, cy: point.y, r: 3, fill: color}))
                }
            }
        }
    }

    #drawPoints(parent: SVGElement, layout: Layout, series: ChartSeriesType, seriesIndex: number): void {
        const rows = this.#rows as Row[]
        const color = seriesColor(seriesIndex, series.color)
        const axis = this.#axisFor(series, layout)
        const highs = this.#shownHighs[seriesIndex]
        const hoverMarks = (this.chartAttrs.hover ?? this.defaultHover()) === "mark"
        for (let i = layout.start; i < layout.end; i++) {
            if (Number.isNaN(highs[i])) {
                continue
            }
            const cx = layout.x.scale.map(rows[i].x)
            const cy = axis.scale.map(highs[i])
            const circle = svgEl("circle", {class: "vtc-chart-point", cx, cy, r: this.pointRadius(rows[i].point, series), fill: color})
            if (hoverMarks) {
                this.addMark(circle, this.#markFor(i, series, seriesIndex, {left: cx, right: cx, y: cy}))
            }
            parent.appendChild(circle)
        }
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

    #drawBars(parent: SVGElement, layout: Layout, bars: {s: ChartSeriesType, i: number}[]): void {
        const rows = this.#rows as Row[]
        const {stacked, horizontal} = this.chartAttrs
        const hoverMarks = (this.chartAttrs.hover ?? this.defaultHover()) === "mark"
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
        const mode = this.chartAttrs.hover ?? this.defaultHover()
        if (!this.#listening) {
            this.#listening = true
            this.drawingHost.addEventListener("pointermove", this.#onPointerMove)
            this.drawingHost.addEventListener("pointerleave", this.#onPointerLeave)
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

    #onPointerMove = (event: PointerEvent) => {
        const layout = this.#layout
        const svg = this.currentSvg
        if (!layout || !svg || (event.target as Element).getAttribute("class") !== "vtc-chart-hit") {
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

    #showNearest(layout: Layout, x: number, y: number): void {
        const rows = this.#rows as Row[]
        const {series} = this.chartAttrs
        let best = Infinity
        let bestRow = -1
        let bestSeries = -1
        for (let s = 0; s < series.length; s++) {
            const axis = this.#axisFor(series[s], layout)
            const highs = this.#shownHighs[s]
            for (let i = layout.start; i < layout.end; i++) {
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
