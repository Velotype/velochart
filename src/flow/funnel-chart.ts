import { ChartFrame } from "../core/chart-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable } from "../core/chart-common.ts"
import type { PieSliceType } from "../radial/pie-chart.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/**
 * Attrs type for `<FunnelChart/>` Component
 */
export type FunnelChartAttrsType = {
    /** The stages, first to last. Their order is kept, since a funnel's order is its meaning */
    data: PieSliceType[]
    /** Shows each stage's share of the first in the tooltip and on the stage (default: `true`) */
    showPercent?: boolean
    /** Header of the value column in the hidden table a screen reader reads. No default */
    valueLabel?: string
    /** Header of the share-of-first column in that table. No default */
    shareLabel?: string
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

/** How much of a group makes it through each stage: each stage's width is its value, narrowing to the next */
export class FunnelChart extends ChartFrame<FunnelChartAttrsType> {
    protected override isEmpty(): boolean {
        return !this.chartAttrs.data.some(stage => stage.value > 0)
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return []
    }

    protected override dataTable(): ChartDataTable {
        const {data, valueLabel, shareLabel} = this.chartAttrs
        const first = data[0]?.value || 1
        return {
            columns: ["", valueLabel ?? "", shareLabel ?? ""],
            rows: data.map(stage => [stage.label, this.format(stage.value), `${((stage.value / first) * 100).toFixed(1)}%`]),
        }
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const {data} = this.chartAttrs
        const largest = data.reduce((n, stage) => Math.max(n, stage.value), 0) || 1
        const first = data[0]?.value || 1
        const longest = data.reduce((n, stage) => Math.max(n, stage.label.length), 0)
        const left = Math.min(width * 0.35, longest * 7 + 12)
        const available = Math.max(1, width - left - 8)
        const centre = left + available / 2
        const stageHeight = height / Math.max(1, data.length)
        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        const showPercent = this.chartAttrs.showPercent ?? true
        data.forEach((stage, i) => {
            const top = stageHeight * i
            const topWidth = (Math.max(0, stage.value) / largest) * available
            const next = data[i + 1]
            // The last stage narrows no further: there is nothing for it to narrow to
            const bottomWidth = next ? (Math.max(0, next.value) / largest) * available : topWidth
            const color = seriesColor(i, stage.color)
            const gap = 2
            const path = svgEl("path", {
                class: "vtc-chart-arc",
                d: `M ${centre - topWidth / 2} ${top} L ${centre + topWidth / 2} ${top} L ${centre + bottomWidth / 2} ${top + stageHeight - gap} L ${centre - bottomWidth / 2} ${top + stageHeight - gap} Z`,
                fill: color,
            })
            const share = `${((stage.value / first) * 100).toFixed(1)}%`
            this.addMark(path, {
                title: stage.label,
                rows: [{label: "", value: showPercent ? `${this.format(stage.value)} (${share})` : this.format(stage.value), color}],
                anchor: {left: centre - topWidth / 2, right: centre + topWidth / 2, y: top + stageHeight / 2},
                detail: {label: stage.label, index: i, value: stage.value},
            })
            marks.appendChild(path)
            const name = svgEl("text", {class: "vtc-chart-tick vtc-chart-tick-y", x: left - 6, y: top + stageHeight / 2})
            name.textContent = stage.label
            svg.appendChild(name)
            const amount = svgEl("text", {class: "vtc-chart-value-label vtc-chart-funnel-value", x: centre, y: top + stageHeight / 2, "dominant-baseline": "middle"})
            amount.textContent = showPercent ? `${this.format(stage.value)} · ${share}` : this.format(stage.value)
            svg.appendChild(amount)
        })
        svg.insertBefore(marks, svg.firstChild)
    }
}
