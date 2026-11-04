import { ChartFrame } from "../core/chart-frame.ts"
import { drawAxes, niceTicks, seriesColor, svgEl, yScale } from "../core/chart-common.ts"
import type {
    ChartBaseAttrsType, ChartDataTable, ChartPointType, ChartSeriesType, PlotBox, TooltipRow
} from "../core/chart-common.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/**
 * Attrs type for `<BarChart/>` Component
 */
export type BarChartAttrsType = {
    /** One entry per category, in display order */
    data: ChartPointType[]
    /** The series to plot; their order sets their palette slots */
    series: ChartSeriesType[]
    /**
     * Bars run left-to-right instead of bottom-to-top (default: `false`).
     *
     * Worth reaching for whenever the category labels are words rather than dates - a horizontal
     * bar gives each label a full line to itself, which is the usual reason vertical labels end up
     * rotated and unreadable.
     */
    horizontal?: boolean
    /** Stacks each category's series into one bar rather than placing them side by side (default: `false`) */
    stacked?: boolean
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

const MARGIN = {left: 56, right: 12, top: 12, bottom: 32}
const HORIZONTAL_MARGIN = {left: 104, right: 24, top: 12, bottom: 28}
/** Share of a category's slot left empty, so neighbouring groups read as separate */
const CATEGORY_PADDING = 0.25

/**
 * A bar chart: vertical or `horizontal`, with series side by side or `stacked`.
 *
 * `data`/`series` are read once at construction - pass a fresh `<BarChart/>` for new data.
 */
export class BarChart extends ChartFrame<BarChartAttrsType> {
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
            rows: data.map(point => [point.label, ...series.map(s => this.format(point.values[s.key] ?? 0))])
        }
    }

    /** The largest extent any single category reaches - a stack's total, or its tallest bar */
    #maxExtent(): number {
        const {data, series, stacked} = this.chartAttrs
        let max = 0
        for (const point of data) {
            if (stacked) {
                max = Math.max(max, series.reduce((sum, s) => sum + Math.max(0, point.values[s.key] ?? 0), 0))
            } else {
                for (const s of series) {
                    max = Math.max(max, point.values[s.key] ?? 0)
                }
            }
        }
        return max
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const attrs = this.chartAttrs
        const margin = attrs.horizontal ? HORIZONTAL_MARGIN : MARGIN
        const box: PlotBox = {
            left: margin.left,
            top: margin.top,
            width: Math.max(1, width - margin.left - margin.right),
            height: Math.max(1, height - margin.top - margin.bottom)
        }
        const ticks = niceTicks(0, this.#maxExtent(), 5)
        const max = ticks[ticks.length - 1]

        if (attrs.horizontal) {
            this.#drawHorizontal(svg, box, ticks, max)
        } else {
            this.#drawVertical(svg, box, ticks, max)
        }
    }

    #drawVertical(svg: SVGElement, box: PlotBox, ticks: number[], max: number): void {
        const attrs = this.chartAttrs
        const toY = yScale(box, 0, max)
        const slot = box.width / Math.max(1, attrs.data.length)
        const centres = attrs.data.map((_, i) => box.left + slot * i + slot / 2)
        const groupWidth = slot * (1 - CATEGORY_PADDING)
        const barWidth = attrs.stacked ? groupWidth : groupWidth / Math.max(1, attrs.series.length)

        drawAxes(svg, box, ticks, toY, attrs.data.map(d => d.label), centres, (v) => this.format(v))
        svg.appendChild(svgEl("line", {
            class: "vtc-chart-axis",
            x1: box.left, y1: box.top + box.height, x2: box.left + box.width, y2: box.top + box.height
        }))

        attrs.data.forEach((point, categoryIndex) => {
            let stackTop = box.top + box.height
            attrs.series.forEach((s, seriesIndex) => {
                const value = point.values[s.key] ?? 0
                const color = seriesColor(seriesIndex, s.color)
                const barHeight = Math.max(0, (Math.max(0, value) / (max || 1)) * box.height)
                const x = attrs.stacked
                    ? centres[categoryIndex] - groupWidth / 2
                    : centres[categoryIndex] - groupWidth / 2 + barWidth * seriesIndex
                const y = attrs.stacked ? stackTop - barHeight : toY(Math.max(0, value))
                if (attrs.stacked) {
                    stackTop -= barHeight
                }
                const rect = svgEl("rect", {
                    class: "vtc-chart-bar",
                    x, y, width: Math.max(1, barWidth - 1), height: barHeight, fill: color, rx: 2
                })
                this.#attachBarHover(svg, rect, point, s.label ?? s.key, value, color, x, x + barWidth, y)
                svg.appendChild(rect)
            })
        })
    }

    #drawHorizontal(svg: SVGElement, box: PlotBox, ticks: number[], max: number): void {
        const attrs = this.chartAttrs
        const slot = box.height / Math.max(1, attrs.data.length)
        const groupHeight = slot * (1 - CATEGORY_PADDING)
        const barHeight = attrs.stacked ? groupHeight : groupHeight / Math.max(1, attrs.series.length)

        // Vertical gridlines and value ticks along the bottom; category names down the left
        for (const tick of ticks) {
            const x = box.left + (tick / (max || 1)) * box.width
            svg.appendChild(svgEl("line", {
                class: "vtc-chart-gridline", x1: x, y1: box.top, x2: x, y2: box.top + box.height
            }))
            const label = svgEl("text", {class: "vtc-chart-tick vtc-chart-tick-x", x, y: box.top + box.height + 18})
            label.textContent = this.format(tick)
            svg.appendChild(label)
        }
        svg.appendChild(svgEl("line", {
            class: "vtc-chart-axis",
            x1: box.left, y1: box.top, x2: box.left, y2: box.top + box.height
        }))

        attrs.data.forEach((point, categoryIndex) => {
            const slotTop = box.top + slot * categoryIndex + (slot - groupHeight) / 2
            const label = svgEl("text", {
                class: "vtc-chart-tick vtc-chart-tick-y",
                x: box.left - 8, y: slotTop + groupHeight / 2
            })
            label.textContent = point.label
            svg.appendChild(label)

            let stackLeft = box.left
            attrs.series.forEach((s, seriesIndex) => {
                const value = point.values[s.key] ?? 0
                const color = seriesColor(seriesIndex, s.color)
                const barWidth = Math.max(0, (Math.max(0, value) / (max || 1)) * box.width)
                const y = attrs.stacked ? slotTop : slotTop + barHeight * seriesIndex
                const x = attrs.stacked ? stackLeft : box.left
                if (attrs.stacked) {
                    stackLeft += barWidth
                }
                const rect = svgEl("rect", {
                    class: "vtc-chart-bar",
                    x, y, width: barWidth, height: Math.max(1, barHeight - 1), fill: color, rx: 2
                })
                this.#attachBarHover(svg, rect, point, s.label ?? s.key, value, color, x, x + barWidth, y + barHeight / 2)
                svg.appendChild(rect)
            })
        })
    }

    /**
     * Dims every other bar while one is hovered.
     *
     * The dimming is a class on the `<svg>` plus one on the hovered bar, rather than a style write
     * per bar: with a few hundred bars, touching each one's style on every pointer move is the
     * difference between smooth and visibly janky.
     */
    #attachBarHover(
        svg: SVGElement, rect: SVGElement, point: ChartPointType,
        seriesLabel: string, value: number, color: string, barLeft: number, barRight: number, tipY: number
    ): void {
        rect.addEventListener("pointerenter", () => {
            svg.classList.add("vtc-chart-hover")
            rect.classList.add("vtc-chart-bar-active")
            const rows: TooltipRow[] = [{label: seriesLabel, value: this.format(value), color}]
            // The bar's own span, so the tooltip never lands on the bar it is describing
            this.tooltip.show(point.label, rows, {left: barLeft, right: barRight, y: tipY}, this.containerBounds())
        })
        rect.addEventListener("pointerleave", () => {
            svg.classList.remove("vtc-chart-hover")
            rect.classList.remove("vtc-chart-bar-active")
            this.tooltip.hide()
        })
    }
}
