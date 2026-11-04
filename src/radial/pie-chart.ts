import { ChartFrame } from "../core/chart-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable, TooltipRow } from "../core/chart-common.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/** One wedge of a `<PieChart/>` */
export type PieSliceType = {
    /** Name shown in the legend and tooltip */
    label: string
    /** The slice's magnitude; negatives are ignored, since a wedge cannot be negative */
    value: number
    /** Overrides this slice's palette slot with an explicit CSS color */
    color?: string
}

/**
 * Attrs type for `<PieChart/>` Component
 */
export type PieChartAttrsType = {
    /** The slices, in drawing order starting at 12 o'clock */
    data: PieSliceType[]
    /**
     * Cuts a hole out of the middle, as a fraction of the radius (`0`-`0.9`, default `0`).
     *
     * `0.6` is the usual donut. A donut reads part-to-whole slightly better than a full pie because
     * the eye compares arc lengths rather than areas, and it leaves room for `centerLabel`.
     */
    donut?: number
    /** Content for the middle of a donut - ignored unless `donut` is set */
    centerLabel?: string
    /** Smaller text under `centerLabel` */
    centerSubLabel?: string
    /** Writes each slice's share on it, leaving out slices too thin to hold it (default: `false`) */
    showValues?: boolean
    /** Shows each slice's share of the total in the tooltip (default: `true`) */
    showPercent?: boolean
    /**
     * Header of the value column in the visually-hidden table a screen reader reads. No default -
     * this package doesn't assume a language, so the column is unnamed unless this is set.
     */
    valueLabel?: string
    /** Header of the share-of-total column in that table. No default, for the same reason */
    shareLabel?: string
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

/**
 * A pie chart, or a donut when `donut` is set.
 *
 * Slices are drawn from 12 o'clock clockwise in the order given - deliberately *not* sorted, since
 * re-ordering a caller's categories silently breaks the correspondence with a legend or table
 * beside it. Sort `data` before passing it if that's what you want.
 */
export class PieChart extends ChartFrame<PieChartAttrsType> {
    #total(): number {
        return this.chartAttrs.data.reduce((sum, slice) => sum + Math.max(0, slice.value), 0)
    }

    /** What the drawn slices add up to, leaving out any the reader has turned off */
    #shownTotal(): number {
        return this.chartAttrs.data.reduce((sum, slice, i) => sum + (this.isEntryHidden(i) ? 0 : Math.max(0, slice.value)), 0)
    }

    protected override isEmpty(): boolean {
        return this.chartAttrs.data.length === 0 || this.#total() <= 0
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return this.chartAttrs.data.map((slice, i) => ({
            label: slice.label, color: seriesColor(i, slice.color)
        }))
    }

    protected override dataTable(): ChartDataTable | undefined {
        const total = this.#total()
        return {
            columns: ["", this.chartAttrs.valueLabel ?? "", this.chartAttrs.shareLabel ?? ""],
            rows: this.chartAttrs.data.map(slice => [
                slice.label,
                this.format(Math.max(0, slice.value)),
                `${((Math.max(0, slice.value) / (total || 1)) * 100).toFixed(1)}%`
            ])
        }
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const attrs = this.chartAttrs
        const total = this.#shownTotal()
        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        const cx = width / 2
        const cy = height / 2
        const radius = Math.max(1, Math.min(width, height) / 2 - 4)
        const innerRadius = radius * Math.min(0.9, Math.max(0, attrs.donut ?? 0))

        const labels: SVGElement[] = []
        let angle = -Math.PI / 2
        attrs.data.forEach((slice, index) => {
            const value = this.isEntryHidden(index) ? 0 : Math.max(0, slice.value)
            if (value <= 0) {
                return
            }
            const sweep = (value / total) * Math.PI * 2
            const color = seriesColor(index, slice.color)
            const path = svgEl("path", {
                class: "vtc-chart-arc",
                d: arcPath(cx, cy, radius, innerRadius, angle, angle + sweep),
                fill: this.fillFor(index, color)
            })

            const midAngle = angle + sweep / 2
            const tipRadius = (radius + innerRadius) / 2
            const percent = `${((value / total) * 100).toFixed(1)}%`
            const rows: TooltipRow[] = [{
                label: slice.label,
                value: (attrs.showPercent ?? true) ? `${this.format(value)} (${percent})` : this.format(value),
                color
            }]
            const tipX = cx + Math.cos(midAngle) * tipRadius
            this.addMark(path, {
                title: "", rows,
                anchor: {left: tipX, right: tipX, y: cy + Math.sin(midAngle) * tipRadius},
                detail: {label: slice.label, index, value: slice.value},
            })
            marks.appendChild(path)
            // Under 5% of the circle there is no room for the text, and the tooltip still says it
            if (attrs.showValues && value / total >= 0.05) {
                const text = svgEl("text", {
                    class: "vtc-chart-value-label", x: tipX, y: cy + Math.sin(midAngle) * tipRadius,
                    "dominant-baseline": "middle",
                })
                text.textContent = percent
                labels.push(text)
            }
            angle += sweep
        })
        svg.appendChild(marks)
        // After every slice, so one slice's text is never painted over by the next slice
        for (const text of labels) {
            svg.appendChild(text)
        }

        if (innerRadius > 0 && attrs.centerLabel !== undefined) {
            const label = svgEl("text", {
                x: cx, y: attrs.centerSubLabel === undefined ? cy : cy - 6,
                "text-anchor": "middle", "dominant-baseline": "middle",
                fill: "var(--text)", "font-size": Math.max(12, innerRadius * 0.42), "font-weight": "bold"
            })
            label.textContent = attrs.centerLabel
            svg.appendChild(label)
            if (attrs.centerSubLabel !== undefined) {
                const sub = svgEl("text", {
                    class: "vtc-chart-tick", x: cx, y: cy + 14, "text-anchor": "middle", "dominant-baseline": "middle"
                })
                sub.textContent = attrs.centerSubLabel
                svg.appendChild(sub)
            }
        }
    }
}

/**
 * Builds one wedge, or one ring segment when `innerRadius > 0`.
 *
 * A full-circle slice is special-cased into two half arcs: an arc whose start and end points are
 * identical draws *nothing* in SVG, so a single-slice pie would otherwise render blank - which
 * looks exactly like a bug in the data.
 */
export function arcPath(
    cx: number, cy: number, radius: number, innerRadius: number, start: number, end: number
): string {
    const nearlyFull = end - start >= Math.PI * 2 - 1e-6
    if (nearlyFull) {
        const mid = start + Math.PI
        return `${arcPath(cx, cy, radius, innerRadius, start, mid)} ${arcPath(cx, cy, radius, innerRadius, mid, start + Math.PI * 2 - 1e-6)}`
    }
    const largeArc = end - start > Math.PI ? 1 : 0
    const x1 = cx + Math.cos(start) * radius
    const y1 = cy + Math.sin(start) * radius
    const x2 = cx + Math.cos(end) * radius
    const y2 = cy + Math.sin(end) * radius
    if (innerRadius <= 0) {
        return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
    }
    const ix1 = cx + Math.cos(end) * innerRadius
    const iy1 = cy + Math.sin(end) * innerRadius
    const ix2 = cx + Math.cos(start) * innerRadius
    const iy2 = cy + Math.sin(start) * innerRadius
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`
}
