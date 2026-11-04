import { ChartFrame } from "../core/chart-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable, ChartPointType, ChartSeriesType, TooltipRow } from "../core/chart-common.ts"
import { niceTicks } from "../core/scale.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/**
 * Attrs type for `<RadarChart/>` Component
 */
export type RadarChartAttrsType = {
    /** One entry per spoke, clockwise from 12 o'clock. Each needs a `label` */
    data: ChartPointType[]
    /** The series to plot; their order sets their palette slots */
    series: ChartSeriesType[]
    /** Fills each shape (default: `true`) */
    fill?: boolean
    /** Fixes the outer ring's value, rather than following the data */
    max?: number
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

/**
 * Several measures of one thing around a circle, so two things can be compared by their shape.
 *
 * Every spoke shares one scale, so the measures have to be in comparable units for a shape to mean
 * anything. A missing value is left out of its shape.
 */
export class RadarChart extends ChartFrame<RadarChartAttrsType> {
    protected override isEmpty(): boolean {
        return this.chartAttrs.data.length < 3 || this.chartAttrs.series.length === 0
    }

    protected override legendEntries(): {label: string, color: string}[] {
        const {series} = this.chartAttrs
        return series.length < 2 ? [] : series.map((s, i) => ({label: s.label ?? s.key, color: seriesColor(i, s.color)}))
    }

    protected override dataTable(): ChartDataTable {
        const {data, series} = this.chartAttrs
        return {
            columns: ["", ...series.map(s => s.label ?? s.key)],
            rows: data.map(point => [point.label ?? "", ...series.map(s => {
                const value = point.values[s.key]
                return value === undefined ? "" : this.format(value)
            })]),
        }
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const {data, series, fill, max: fixedMax} = this.chartAttrs
        let largest = 0
        for (const point of data) {
            series.forEach((s, i) => {
                if (!this.isEntryHidden(i)) {
                    largest = Math.max(largest, point.values[s.key] ?? 0)
                }
            })
        }
        const ticks = fixedMax !== undefined ? niceTicks(0, fixedMax, 4).filter(tick => tick <= fixedMax) : niceTicks(0, largest || 1, 4)
        const top = fixedMax ?? ticks[ticks.length - 1]
        const cx = width / 2
        const cy = height / 2
        // Room for the spoke labels, which sit outside the outer ring
        const radius = Math.max(1, Math.min(width / 2 - 48, height / 2 - 24))
        const count = data.length
        const angleOf = (index: number) => -Math.PI / 2 + (index / count) * Math.PI * 2
        const point = (index: number, value: number) => ({
            x: cx + Math.cos(angleOf(index)) * radius * (value / top),
            y: cy + Math.sin(angleOf(index)) * radius * (value / top),
        })

        for (const tick of ticks) {
            if (tick <= 0) {
                continue
            }
            const ring = data.map((_, i) => point(i, tick))
            svg.appendChild(svgEl("path", {class: "vtc-chart-ring", d: `M ${ring.map(p => `${p.x} ${p.y}`).join(" L ")} Z`}))
            const label = svgEl("text", {class: "vtc-chart-tick vtc-chart-ring-label", x: cx + 4, y: cy - radius * (tick / top)})
            label.textContent = this.format(tick)
            svg.appendChild(label)
        }
        data.forEach((entry, i) => {
            const end = point(i, top)
            svg.appendChild(svgEl("line", {class: "vtc-chart-spoke", x1: cx, y1: cy, x2: end.x, y2: end.y}))
            const cos = Math.cos(angleOf(i))
            const label = svgEl("text", {
                class: "vtc-chart-tick vtc-chart-spoke-label",
                x: cx + cos * (radius + 10), y: cy + Math.sin(angleOf(i)) * (radius + 14),
                "text-anchor": Math.abs(cos) < 0.1 ? "middle" : cos > 0 ? "start" : "end",
            })
            label.textContent = entry.label ?? ""
            svg.appendChild(label)
        })

        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        series.forEach((s, seriesIndex) => {
            if (this.isEntryHidden(seriesIndex)) {
                return
            }
            const color = seriesColor(seriesIndex, s.color)
            const corners: {x: number, y: number}[] = []
            data.forEach((entry, i) => {
                const value = entry.values[s.key]
                if (value !== undefined && Number.isFinite(value)) {
                    corners.push(point(i, Math.max(0, value)))
                }
            })
            if (corners.length === 0) {
                return
            }
            const d = `M ${corners.map(p => `${p.x} ${p.y}`).join(" L ")} Z`
            if (fill ?? true) {
                marks.appendChild(svgEl("path", {class: "vtc-chart-area", d, fill: color}))
            }
            marks.appendChild(svgEl("path", {class: "vtc-chart-line", d, stroke: color}))
            for (const corner of corners) {
                marks.appendChild(svgEl("circle", {class: "vtc-chart-dot", cx: corner.x, cy: corner.y, r: 3, fill: color}))
            }
        })
        svg.appendChild(marks)

        // An invisible sector per spoke, so a pointer anywhere near one reads it. A 2px outline is not
        // a pointer target here any more than on a line chart.
        const half = Math.PI / count
        data.forEach((entry, i) => {
            const a = angleOf(i) - half
            const b = angleOf(i) + half
            const sector = svgEl("path", {
                class: "vtc-chart-sector",
                d: `M ${cx} ${cy} L ${cx + Math.cos(a) * radius} ${cy + Math.sin(a) * radius} A ${radius} ${radius} 0 0 1 ${cx + Math.cos(b) * radius} ${cy + Math.sin(b) * radius} Z`,
            })
            const rows: TooltipRow[] = []
            series.forEach((s, seriesIndex) => {
                const value = entry.values[s.key]
                if (value !== undefined && !this.isEntryHidden(seriesIndex)) {
                    rows.push({label: s.label ?? s.key, value: this.format(value), color: seriesColor(seriesIndex, s.color)})
                }
            })
            const tip = point(i, top * 0.6)
            this.addMark(sector, {
                title: entry.label ?? "", rows,
                anchor: {left: tip.x, right: tip.x, y: tip.y},
                detail: {label: entry.label ?? "", index: i},
            })
            svg.appendChild(sector)
        })
    }
}
