import { ChartFrame } from "../core/chart-frame.ts"
import {
    bandCentres, drawAxes, niceTicks, seriesColor, svgEl, yScale
} from "../core/chart-common.ts"
import type {
    ChartBaseAttrsType, ChartDataTable, ChartPointType, ChartSeriesType, PlotBox, TooltipRow
} from "../core/chart-common.ts"
import type { IdAttr, RenderableElements, StylePassthroughAttrs } from "../core/velotype.ts"

/**
 * Attrs type for `<LineChart/>` and `<AreaChart/>`
 */
export type LineChartAttrsType = {
    /** One entry per category along the x axis, in display order */
    data: ChartPointType[]
    /** The series to plot; their order sets their palette slots */
    series: ChartSeriesType[]
    /** Fills the space under each line (default: `false` - `AreaChart` sets it) */
    area?: boolean
    /** Stacks the series on top of each other rather than overlaying them (default: `false`) */
    stacked?: boolean
    /** Draws a dot at each point (default: `true` when there are fewer than 40 points) */
    showDots?: boolean
    /** Starts the value axis at zero rather than at the data's own minimum (default: `true`) */
    beginAtZero?: boolean
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

/** Space reserved for the axis labels around the plot */
const MARGIN = {left: 56, right: 12, top: 12, bottom: 32}

/**
 * A line chart, optionally filled (`area`) and optionally `stacked`.
 *
 * `data`/`series` are read once at construction, like every other stateful component here - pass a
 * fresh `<LineChart/>` to show new data rather than mutating the array in place.
 *
 * Hovering anywhere over the plot highlights the nearest category and shows every series' value at
 * it, rather than requiring the pointer to land on a 2px line. That is the one interaction detail
 * that decides whether a line chart is usable at all.
 */
export class LineChart extends ChartFrame<LineChartAttrsType> {
    #centres: number[] = []
    /** Category the marker currently sits on, so an unchanged hover rewrites nothing */
    #markerIndex = -1

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
        const {data, series} = this.chartAttrs
        return {
            columns: ["", ...series.map(s => s.label ?? s.key)],
            // Each series' own value, not the stacked running total - the same choice the tooltip
            // makes, so what is read aloud matches what a sighted reader is told.
            rows: data.map(point => [point.label, ...series.map(s => this.format(point.values[s.key] ?? 0))])
        }
    }

    /** Values per series, stacked cumulatively when `stacked` is set */
    #stackedValues(): number[][] {
        const {data, series, stacked} = this.chartAttrs
        return data.map(point => {
            let running = 0
            return series.map(s => {
                const value = point.values[s.key] ?? 0
                if (stacked) {
                    running += value
                    return running
                }
                return value
            })
        })
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const attrs = this.chartAttrs
        const box: PlotBox = {
            left: MARGIN.left,
            top: MARGIN.top,
            width: Math.max(1, width - MARGIN.left - MARGIN.right),
            height: Math.max(1, height - MARGIN.top - MARGIN.bottom)
        }

        const stacked = this.#stackedValues()
        const flat = stacked.flat().filter(v => Number.isFinite(v))
        const rawMin = flat.length ? Math.min(...flat) : 0
        const rawMax = flat.length ? Math.max(...flat) : 1
        const beginAtZero = attrs.beginAtZero ?? true
        const ticks = niceTicks(beginAtZero ? Math.min(0, rawMin) : rawMin, rawMax, 5)
        const min = ticks[0]
        const max = ticks[ticks.length - 1]
        const toY = yScale(box, min, max)
        const centres = bandCentres(box, attrs.data.length)
        this.#centres = centres

        drawAxes(svg, box, ticks, toY, attrs.data.map(d => d.label), centres, (v) => this.format(v))
        svg.appendChild(svgEl("line", {
            class: "vtc-chart-axis",
            x1: box.left, y1: box.top + box.height, x2: box.left + box.width, y2: box.top + box.height
        }))

        const baselineY = toY(Math.max(min, Math.min(0, max)))
        const showDots = attrs.showDots ?? (attrs.data.length < 40)

        // Drawn back-to-front so a stacked area's later series sit above the earlier ones
        attrs.series.forEach((s, seriesIndex) => {
            const color = seriesColor(seriesIndex, s.color)
            const points = stacked.map((row, i) => ({x: centres[i], y: toY(row[seriesIndex])}))
            if (points.length === 0) {
                return
            }

            if (attrs.area) {
                // A stacked area's lower edge is the previous series' line; an unstacked one's is
                // the baseline. Without that distinction stacked bands would all fill to zero and
                // hide each other.
                const lowerEdge = attrs.stacked && seriesIndex > 0
                    ? stacked.map((row, i) => ({x: centres[i], y: toY(row[seriesIndex - 1])})).reverse()
                    : [{x: points[points.length - 1].x, y: baselineY}, {x: points[0].x, y: baselineY}]
                const d = `M ${points.map(p => `${p.x} ${p.y}`).join(" L ")} L ${lowerEdge.map(p => `${p.x} ${p.y}`).join(" L ")} Z`
                svg.appendChild(svgEl("path", {class: "vtc-chart-area", d, fill: color}))
            }

            svg.appendChild(svgEl("path", {
                class: "vtc-chart-line",
                d: `M ${points.map(p => `${p.x} ${p.y}`).join(" L ")}`,
                stroke: color
            }))

            if (showDots) {
                for (const point of points) {
                    svg.appendChild(svgEl("circle", {
                        class: "vtc-chart-dot", cx: point.x, cy: point.y, r: 3, fill: color
                    }))
                }
            }
        })

        this.#markerIndex = -1
        this.#attachHover(svg, box)
    }

    /**
     * One transparent rectangle over the whole plot, tracking the nearest category, rather than a
     * hit target per point: a pointer only has to be near the right column, not on a 2px line.
     */
    #attachHover(svg: SVGElement, box: PlotBox): void {
        const attrs = this.chartAttrs
        const marker = svgEl("line", {class: "vtc-chart-gridline", y1: box.top, y2: box.top + box.height})
        marker.setAttribute("visibility", "hidden")
        svg.appendChild(marker)

        const hit = svgEl("rect", {
            class: "vtc-chart-hit",
            x: box.left, y: box.top, width: box.width, height: box.height
        })
        hit.addEventListener("pointermove", (event: Event) => {
            const pointer = event as PointerEvent
            const rect = (svg as unknown as SVGSVGElement).getBoundingClientRect()
            const x = pointer.clientX - rect.left
            let nearest = 0
            let best = Infinity
            this.#centres.forEach((centre, index) => {
                const distance = Math.abs(centre - x)
                if (distance < best) {
                    best = distance
                    nearest = index
                }
            })
            const point = attrs.data[nearest]
            if (!point) {
                return
            }
            // Only touch the marker when it actually moves to a different category - a pointer
            // wandering inside one column would otherwise rewrite three attributes per event.
            if (nearest !== this.#markerIndex) {
                this.#markerIndex = nearest
                marker.setAttribute("visibility", "visible")
                marker.setAttribute("x1", String(this.#centres[nearest]))
                marker.setAttribute("x2", String(this.#centres[nearest]))
            }
            const rows: TooltipRow[] = attrs.series.map((s, i) => ({
                label: s.label ?? s.key,
                // The tooltip shows each series' own value, never its stacked running total -
                // "this series contributed 12" is the fact a reader wants, not "the stack reached 40".
                value: this.format(point.values[s.key] ?? 0),
                color: seriesColor(i, s.color)
            }))
            // Anchored on the pointer, not on the category centre: that keeps the offset constant
            // as the cursor moves, and stops the tooltip ever sitting *under* the cursor - which
            // is what it does when anchored on a centre the pointer has already moved past.
            // The span to clear is everything between the cursor and the marker line - the marker
            // can sit either side of the pointer, and covering it hides which category is selected.
            const centre = this.#centres[nearest]
            this.tooltip.show(point.label, rows, {
                left: Math.min(x, centre), right: Math.max(x, centre), y: pointer.clientY - rect.top
            }, this.containerBounds())
        })
        hit.addEventListener("pointerleave", () => {
            this.#markerIndex = -1
            marker.setAttribute("visibility", "hidden")
            this.tooltip.hide()
        })
        svg.appendChild(hit)
    }
}

/**
 * Attrs type for `<AreaChart/>` Component - identical to `LineChart`'s, minus `area`, which is
 * what this component sets.
 */
export type AreaChartAttrsType = Omit<LineChartAttrsType, "area">

/**
 * A filled line chart. Exactly `LineChart` with `area` set - a separate component because "area
 * chart" is the name people look for, and because `stacked` reads as meaningful here and merely
 * odd on a bare line.
 */
export class AreaChart extends LineChart {
    constructor(attrs: AreaChartAttrsType, children: RenderableElements[]) {
        super({...attrs, area: true}, children)
    }
}
