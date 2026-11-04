import { ChartFrame } from "../core/chart-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable } from "../core/chart-common.ts"
import { niceTicks } from "../core/scale.ts"
import { arcPath } from "./pie-chart.ts"
import type { PieSliceType } from "./pie-chart.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/**
 * Attrs type for `<PolarAreaChart/>` Component
 */
export type PolarAreaChartAttrsType = {
    /** The slices, clockwise from 12 o'clock */
    data: PieSliceType[]
    /** Header of the value column in the hidden table a screen reader reads. No default */
    valueLabel?: string
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

/**
 * A pie whose slices are equal in angle and differ in how far they reach, for values that are not
 * parts of one whole. The reach is linear in the value, as the rings behind it say.
 */
export class PolarAreaChart extends ChartFrame<PolarAreaChartAttrsType> {
    protected override isEmpty(): boolean {
        return !this.chartAttrs.data.some(slice => slice.value > 0)
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return this.chartAttrs.data.map((slice, i) => ({label: slice.label, color: seriesColor(i, slice.color)}))
    }

    protected override dataTable(): ChartDataTable {
        return {
            columns: ["", this.chartAttrs.valueLabel ?? ""],
            rows: this.chartAttrs.data.map(slice => [slice.label, this.format(slice.value)]),
        }
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const {data} = this.chartAttrs
        const shown = data.filter((_, i) => !this.isEntryHidden(i)).map(slice => Math.max(0, slice.value))
        const ticks = niceTicks(0, shown.reduce((n, value) => Math.max(n, value), 0) || 1, 4)
        const top = ticks[ticks.length - 1]
        const cx = width / 2
        const cy = height / 2
        const radius = Math.max(1, Math.min(width, height) / 2 - 6)

        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        const sweep = (Math.PI * 2) / Math.max(1, shown.length)
        let angle = -Math.PI / 2
        data.forEach((slice, index) => {
            if (this.isEntryHidden(index)) {
                return
            }
            const reach = radius * (Math.max(0, slice.value) / top)
            const color = seriesColor(index, slice.color)
            const path = svgEl("path", {class: "vtc-chart-arc", d: arcPath(cx, cy, Math.max(0.5, reach), 0, angle, angle + sweep), fill: this.fillFor(index, color)})
            const middle = angle + sweep / 2
            const tipX = cx + Math.cos(middle) * reach * 0.6
            this.addMark(path, {
                title: "",
                rows: [{label: slice.label, value: this.format(slice.value), color}],
                anchor: {left: tipX, right: tipX, y: cy + Math.sin(middle) * reach * 0.6},
                detail: {label: slice.label, index, value: slice.value},
            })
            marks.appendChild(path)
            angle += sweep
        })
        svg.appendChild(marks)

        // Over the slices, since the rings are how a reader gets a value out of a slice's reach
        for (const tick of ticks) {
            if (tick <= 0) {
                continue
            }
            svg.appendChild(svgEl("circle", {class: "vtc-chart-ring", cx, cy, r: radius * (tick / top)}))
            const label = svgEl("text", {class: "vtc-chart-tick vtc-chart-ring-label", x: cx + 4, y: cy - radius * (tick / top)})
            label.textContent = this.format(tick)
            svg.appendChild(label)
        }
    }
}
