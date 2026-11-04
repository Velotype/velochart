import { ChartFrame } from "../core/chart-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable } from "../core/chart-common.ts"
import { arcPath } from "../radial/pie-chart.ts"
import { leafRows, nodeTotal } from "./tree.ts"
import type { TreeNodeType } from "./tree.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/**
 * Attrs type for `<SunburstChart/>` Component
 */
export type SunburstChartAttrsType = {
    /** The top-level nodes, which make the innermost ring */
    data: TreeNodeType[]
    /** Size of the hole in the middle, as a fraction of the radius (default: `0.2`) */
    hole?: number
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

function depthOf(nodes: TreeNodeType[]): number {
    return nodes.reduce((deepest, node) => Math.max(deepest, 1 + (node.children ? depthOf(node.children) : 0)), 0)
}

/** Nested parts of a whole as rings, for when the levels matter as much as the sizes */
export class SunburstChart extends ChartFrame<SunburstChartAttrsType> {
    protected override isEmpty(): boolean {
        return !this.chartAttrs.data.some(node => nodeTotal(node) > 0)
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return this.chartAttrs.data.map((node, i) => ({label: node.label, color: seriesColor(i, node.color)}))
    }

    protected override dataTable(): ChartDataTable {
        return {columns: ["", ""], rows: leafRows(this.chartAttrs.data, (value) => this.format(value))}
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const {data, hole} = this.chartAttrs
        const cx = width / 2
        const cy = height / 2
        const radius = Math.max(1, Math.min(width, height) / 2 - 4)
        const inner = radius * Math.min(0.8, Math.max(0, hole ?? 0.2))
        const ring = (radius - inner) / Math.max(1, depthOf(data))
        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        let order = 0
        const lay = (nodes: TreeNodeType[], start: number, sweep: number, depth: number, inherited: string | undefined, path: string[]) => {
            const shown = nodes.map((node, i) => depth === 0 && this.isEntryHidden(i) ? 0 : nodeTotal(node))
            const total = shown.reduce((sum, value) => sum + value, 0)
            if (total <= 0) {
                return
            }
            let angle = start
            nodes.forEach((node, i) => {
                const value = shown[i]
                if (value <= 0) {
                    return
                }
                const share = (value / total) * sweep
                const color = node.color ?? inherited ?? seriesColor(i)
                // Each ring out is a little lighter than its parent, so the levels read apart
                const fill = depth === 0 ? color : `color-mix(in srgb, ${color} ${Math.max(45, 100 - depth * 18)}%, var(--background))`
                const from = inner + ring * depth
                const path_ = svgEl("path", {class: "vtc-chart-arc", d: arcPath(cx, cy, from + ring, from, angle, angle + share), fill})
                const middle = angle + share / 2
                const reach = from + ring / 2
                const tipX = cx + Math.cos(middle) * reach
                const title = [...path, node.label].join(" / ")
                this.addMark(path_, {
                    title, rows: [{label: "", value: this.format(value), color: fill}],
                    anchor: {left: tipX, right: tipX, y: cy + Math.sin(middle) * reach},
                    detail: {label: node.label, index: order++, value},
                })
                marks.appendChild(path_)
                if (node.children && node.children.length > 0) {
                    lay(node.children, angle, share, depth + 1, color, [...path, node.label])
                }
                angle += share
            })
        }
        lay(data, -Math.PI / 2, Math.PI * 2, 0, undefined, [])
        svg.appendChild(marks)
    }
}
