import { ChartFrame } from "../core/chart-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable } from "../core/chart-common.ts"
import { leafRows, nodeTotal } from "./tree.ts"
import type { TreeNodeType } from "./tree.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/**
 * Attrs type for `<Treemap/>` Component
 */
export type TreemapAttrsType = {
    /** The top-level nodes */
    data: TreeNodeType[]
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

type Rect = {x: number, y: number, width: number, height: number}

/**
 * Squarified layout (Bruls, Huijsen and van Wijk): lays items in rows along the shorter side, starting
 * a new row when adding one more would make the row's rectangles less square. Long slivers are what
 * make a treemap unreadable, and this is what keeps them from forming.
 */
export function squarify<T>(items: {item: T, value: number}[], area: Rect): {item: T, rect: Rect}[] {
    const total = items.reduce((sum, entry) => sum + entry.value, 0)
    const placed: {item: T, rect: Rect}[] = []
    if (total <= 0 || area.width <= 0 || area.height <= 0) {
        return placed
    }
    const scale = (area.width * area.height) / total
    const sorted = items.filter(entry => entry.value > 0).sort((a, b) => b.value - a.value)
    let {x, y, width, height} = area
    let index = 0
    while (index < sorted.length) {
        const side = Math.min(width, height)
        let rowArea = 0
        let end = index
        let best = Infinity
        while (end < sorted.length) {
            const nextArea = rowArea + sorted[end].value * scale
            const thickness = nextArea / side
            // The worst aspect ratio in the row, which is always its first or last item
            const largest = (sorted[index].value * scale) / thickness
            const smallest = (sorted[end].value * scale) / thickness
            const worst = Math.max(largest / thickness, thickness / largest, smallest / thickness, thickness / smallest)
            if (worst > best) {
                break
            }
            best = worst
            rowArea = nextArea
            end++
        }
        const thickness = rowArea / side
        let along = 0
        for (let i = index; i < end; i++) {
            const length = (sorted[i].value * scale) / thickness
            placed.push({
                item: sorted[i].item,
                rect: width >= height
                    ? {x, y: y + along, width: thickness, height: length}
                    : {x: x + along, y, width: length, height: thickness},
            })
            along += length
        }
        if (width >= height) {
            x += thickness
            width -= thickness
        } else {
            y += thickness
            height -= thickness
        }
        index = end
    }
    return placed
}

/** Nested parts of a whole, each sized by area. The top level sets the colors and is in the legend */
export class Treemap extends ChartFrame<TreemapAttrsType> {
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
        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        const labels: SVGElement[] = []
        let order = 0
        const lay = (nodes: TreeNodeType[], area: Rect, inherited: string | undefined, path: string[]) => {
            const items = nodes.map((node, i) => {
                const hidden = path.length === 0 && this.isEntryHidden(i)
                return {
                    item: {node, color: node.color ?? inherited ?? seriesColor(i)},
                    value: hidden ? 0 : nodeTotal(node),
                }
            })
            for (const {item, rect} of squarify(items, area)) {
                const {node, color} = item
                if (node.children && node.children.length > 0) {
                    lay(node.children, {x: rect.x + 1, y: rect.y + 1, width: rect.width - 2, height: rect.height - 2}, color, [...path, node.label])
                    continue
                }
                const shape = svgEl("rect", {class: "vtc-chart-cell", ...rect, fill: color})
                const value = nodeTotal(node)
                const title = [...path, node.label].join(" / ")
                this.addMark(shape, {
                    title, rows: [{label: "", value: this.format(value), color}],
                    anchor: {left: rect.x, right: rect.x + rect.width, y: rect.y + rect.height / 2},
                    detail: {label: node.label, index: order++, value},
                })
                marks.appendChild(shape)
                // Only where it fits: a clipped name reads worse than none, and the tooltip has it
                if (rect.width > node.label.length * 7 + 8 && rect.height > 18) {
                    const text = svgEl("text", {class: "vtc-chart-cell-label vtc-chart-treemap-label", x: rect.x + rect.width / 2, y: rect.y + rect.height / 2})
                    text.textContent = node.label
                    labels.push(text)
                }
            }
        }
        lay(this.chartAttrs.data, {x: 0, y: 0, width, height}, undefined, [])
        svg.appendChild(marks)
        for (const text of labels) {
            svg.appendChild(text)
        }
    }
}
