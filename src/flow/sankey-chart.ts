import { ChartFrame } from "../core/chart-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable } from "../core/chart-common.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/** One node of a `<SankeyChart/>` */
export type SankeyNodeType = {
    id: string
    /** Its name (default: its `id`) */
    label?: string
    /** A CSS color (default: its palette slot) */
    color?: string
}

/** One flow between two nodes of a `<SankeyChart/>` */
export type SankeyLinkType = {
    /** The `id` it comes from */
    source: string
    /** The `id` it goes to */
    target: string
    value: number
}

/**
 * Attrs type for `<SankeyChart/>` Component
 */
export type SankeyChartAttrsType = {
    nodes: SankeyNodeType[]
    /** The flows. One that would close a loop is left out, since a flow diagram runs one way */
    links: SankeyLinkType[]
    /** The thickness of a node in px (default: `14`) */
    nodeWidth?: number
    /** The gap between nodes in a column, in px (default: `10`) */
    nodePadding?: number
    /** Column headers of the hidden table a screen reader reads. No default */
    tableLabels?: {source: string, target: string, value: string}
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

type LaidNode = {
    node: SankeyNodeType
    index: number
    column: number
    value: number
    y: number
    height: number
    incoming: LaidLink[]
    outgoing: LaidLink[]
}

type LaidLink = {link: SankeyLinkType, from: LaidNode, to: LaidNode, sourceY: number, targetY: number, thickness: number}

/** Links in the order given, without any that would close a loop, so the columns always exist */
function acyclic(nodes: SankeyNodeType[], links: SankeyLinkType[]): SankeyLinkType[] {
    const known = new Set(nodes.map(node => node.id))
    const reach = new Map<string, Set<string>>()
    const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
        if (from === to) {
            return true
        }
        seen.add(from)
        for (const next of reach.get(from) ?? []) {
            if (!seen.has(next) && reaches(next, to, seen)) {
                return true
            }
        }
        return false
    }
    return links.filter(link => {
        if (!known.has(link.source) || !known.has(link.target) || !(link.value > 0) || reaches(link.target, link.source)) {
            return false
        }
        const targets = reach.get(link.source) ?? new Set<string>()
        targets.add(link.target)
        reach.set(link.source, targets)
        return true
    })
}

/** Flows between stages, each band's thickness being how much moved. Columns follow the longest route to a node */
export class SankeyChart extends ChartFrame<SankeyChartAttrsType> {
    protected override isEmpty(): boolean {
        return acyclic(this.chartAttrs.nodes, this.chartAttrs.links).length === 0
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return []
    }

    #name(id: string): string {
        const node = this.chartAttrs.nodes.find(entry => entry.id === id)
        return node?.label ?? id
    }

    protected override dataTable(): ChartDataTable {
        const {nodes, links, tableLabels} = this.chartAttrs
        return {
            columns: [tableLabels?.source ?? "", tableLabels?.target ?? "", tableLabels?.value ?? ""],
            rows: acyclic(nodes, links).map(link => [this.#name(link.source), this.#name(link.target), this.format(link.value)]),
        }
    }

    #layout(width: number, height: number): {laid: LaidNode[], links: LaidLink[], nodeWidth: number} {
        const {nodes, links} = this.chartAttrs
        const nodeWidth = this.chartAttrs.nodeWidth ?? 14
        const padding = this.chartAttrs.nodePadding ?? 10
        const byId = new Map<string, LaidNode>()
        const laid = nodes.map((node, index): LaidNode => {
            const entry = {node, index, column: 0, value: 0, y: 0, height: 0, incoming: [], outgoing: []}
            byId.set(node.id, entry)
            return entry
        })
        const laidLinks = acyclic(nodes, links).map((link): LaidLink => {
            const from = byId.get(link.source) as LaidNode
            const to = byId.get(link.target) as LaidNode
            const entry = {link, from, to, sourceY: 0, targetY: 0, thickness: 0}
            from.outgoing.push(entry)
            to.incoming.push(entry)
            return entry
        })
        // The longest route to each node, relaxed once per node, which reaches every route in a graph with no loops
        for (let pass = 0; pass < laid.length; pass++) {
            for (const link of laidLinks) {
                link.to.column = Math.max(link.to.column, link.from.column + 1)
            }
        }
        const lastColumn = laid.reduce((n, node) => Math.max(n, node.column), 0)
        const columns: LaidNode[][] = Array.from({length: lastColumn + 1}, () => [])
        for (const node of laid) {
            const inFlow = node.incoming.reduce((sum, link) => sum + link.link.value, 0)
            const outFlow = node.outgoing.reduce((sum, link) => sum + link.link.value, 0)
            node.value = Math.max(inFlow, outFlow)
            if (node.value > 0) {
                columns[node.column].push(node)
            }
        }
        // One scale for every column, set by the fullest, so a band is the same thickness at both ends
        const scale = columns.reduce((best, column) => {
            const total = column.reduce((sum, node) => sum + node.value, 0)
            return total > 0 ? Math.min(best, (height - padding * Math.max(0, column.length - 1)) / total) : best
        }, Infinity)
        for (const column of columns) {
            let y = 0
            for (const node of column) {
                node.height = Math.max(1, node.value * scale)
                node.y = y
                y += node.height + padding
            }
        }
        // A few sweeps pulling each node toward the middle of what it connects to, which uncrosses most bands
        const middle = (node: LaidNode) => node.y + node.height / 2
        for (let sweep = 0; sweep < 6; sweep++) {
            const order = sweep % 2 === 0 ? columns : [...columns].reverse()
            for (const column of order) {
                for (const node of column) {
                    const neighbours = sweep % 2 === 0 ? node.incoming.map(link => link.from) : node.outgoing.map(link => link.to)
                    if (neighbours.length > 0) {
                        const target = neighbours.reduce((sum, other) => sum + middle(other), 0) / neighbours.length
                        node.y = target - node.height / 2
                    }
                }
                column.sort((a, b) => a.y - b.y)
                let y = 0
                for (const node of column) {
                    node.y = Math.max(y, node.y)
                    y = node.y + node.height + padding
                }
                // Anything pushed off the bottom comes back up, keeping the gaps
                let overflow = y - padding - height
                for (let i = column.length - 1; i >= 0 && overflow > 0; i--) {
                    const room = i === 0 ? column[i].y : column[i].y - column[i - 1].y - column[i - 1].height - padding
                    const move = Math.min(overflow, Math.max(0, room))
                    for (let j = i; j < column.length; j++) {
                        column[j].y -= move
                    }
                    overflow -= move
                }
            }
        }
        for (const node of laid) {
            node.outgoing.sort((a, b) => middle(a.to) - middle(b.to))
            node.incoming.sort((a, b) => middle(a.from) - middle(b.from))
            let out = node.y
            for (const link of node.outgoing) {
                link.thickness = link.link.value * scale
                link.sourceY = out
                out += link.thickness
            }
            let into = node.y
            for (const link of node.incoming) {
                link.thickness = link.link.value * scale
                link.targetY = into
                into += link.thickness
            }
        }
        const step = lastColumn === 0 ? 0 : (width - nodeWidth) / lastColumn
        for (const node of laid) {
            node.column = node.column * step
        }
        return {laid, links: laidLinks, nodeWidth}
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const {laid, links, nodeWidth} = this.#layout(width, height)
        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        const colorOf = (node: LaidNode) => seriesColor(node.index, node.node.color)
        links.forEach((link, index) => {
            const x0 = link.from.column + nodeWidth
            const x1 = link.to.column
            const bend = (x1 - x0) / 2
            const d = `M ${x0} ${link.sourceY} C ${x0 + bend} ${link.sourceY} ${x1 - bend} ${link.targetY} ${x1} ${link.targetY}`
                + ` L ${x1} ${link.targetY + link.thickness} C ${x1 - bend} ${link.targetY + link.thickness} ${x0 + bend} ${link.sourceY + link.thickness} ${x0} ${link.sourceY + link.thickness} Z`
            const band = svgEl("path", {class: "vtc-chart-link", d, fill: colorOf(link.from)})
            const title = `${this.#name(link.link.source)} → ${this.#name(link.link.target)}`
            const middleX = (x0 + x1) / 2
            this.addMark(band, {
                title, rows: [{label: "", value: this.format(link.link.value), color: colorOf(link.from)}],
                anchor: {left: middleX, right: middleX, y: (link.sourceY + link.targetY + link.thickness) / 2},
                detail: {label: title, index, value: link.link.value},
            })
            marks.appendChild(band)
        })
        for (const node of laid) {
            if (node.value <= 0) {
                continue
            }
            const rect = svgEl("rect", {class: "vtc-chart-node", x: node.column, y: node.y, width: nodeWidth, height: node.height, fill: colorOf(node), rx: 2})
            const name = node.node.label ?? node.node.id
            this.addMark(rect, {
                title: name, rows: [{label: "", value: this.format(node.value), color: colorOf(node)}],
                anchor: {left: node.column, right: node.column + nodeWidth, y: node.y + node.height / 2},
                detail: {label: name, index: node.index, value: node.value},
            })
            marks.appendChild(rect)
            const onRight = node.column + nodeWidth + 6 + name.length * 7 < width
            const label = svgEl("text", {
                class: "vtc-chart-node-label",
                x: onRight ? node.column + nodeWidth + 6 : node.column - 6,
                y: node.y + node.height / 2, "text-anchor": onRight ? "start" : "end",
            })
            label.textContent = name
            marks.appendChild(label)
        }
        svg.appendChild(marks)
    }
}
