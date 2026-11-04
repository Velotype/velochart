import { CartesianFrame } from "./cartesian-frame.ts"
import type { CartesianAttrsType } from "./cartesian-frame.ts"
import type { ChartPointType, ChartSeriesKind } from "../core/chart-common.ts"
import { niceTicks } from "../core/scale.ts"
import type { RenderableElements } from "../core/velotype.ts"

/**
 * Attrs type for `<HistogramChart/>` Component
 */
export type HistogramChartAttrsType = Omit<CartesianAttrsType, "data" | "series" | "stacked" | "horizontal" | "showDots" | "spanGaps"> & {
    /** The raw values to count into bins */
    values: number[]
    /** About how many bins, or the exact edges between them, ascending (default: Sturges' rule) */
    bins?: number | number[]
    /** Names the count in the tooltip and the hidden table. Unset, the row shows the number alone */
    countLabel?: string
    /** A CSS color for the bars (default: the first series color) */
    color?: string
}

/** Counts values into bins with round edges. A value on an edge goes to the bin it starts */
function binned(values: number[], bins: number | number[] | undefined): ChartPointType[] {
    const finite = values.filter(value => Number.isFinite(value))
    if (finite.length === 0) {
        return []
    }
    let edges: number[]
    if (Array.isArray(bins)) {
        edges = bins
    } else {
        let min = Infinity
        let max = -Infinity
        for (const value of finite) {
            if (value < min) {min = value}
            if (value > max) {max = value}
        }
        const count = bins ?? Math.ceil(Math.log2(finite.length)) + 1
        edges = niceTicks(min, max, Math.max(1, count))
        // The top edge belongs to the last bin, so the largest value has to be below it or on it
        if (edges[edges.length - 1] < max) {
            edges.push(edges[edges.length - 1] + (edges[1] - edges[0]))
        }
    }
    if (edges.length < 2) {
        return []
    }
    const counts = new Array<number>(edges.length - 1).fill(0)
    for (const value of finite) {
        if (value < edges[0] || value > edges[edges.length - 1]) {
            continue
        }
        let low = 0
        let high = edges.length - 2
        while (low < high) {
            const middle = (low + high + 1) >> 1
            if (edges[middle] <= value) {
                low = middle
            } else {
                high = middle - 1
            }
        }
        counts[low]++
    }
    return counts.map((count, i) => ({
        x: (edges[i] + edges[i + 1]) / 2,
        label: `${edges[i]} - ${edges[i + 1]}`,
        values: {count},
    }))
}

function toEngineAttrs(attrs: HistogramChartAttrsType): CartesianAttrsType {
    return {
        ...attrs,
        data: binned(attrs.values, attrs.bins),
        series: [{key: "count", label: attrs.countLabel ?? "", color: attrs.color}],
    }
}

/**
 * How raw values are distributed: counted into bins, with the bars touching since the bins do.
 * The x axis is a real numeric one, so it reads in the values' own units rather than in bin names.
 */
export class HistogramChart extends CartesianFrame<CartesianAttrsType> {
    constructor(attrs: HistogramChartAttrsType, children: RenderableElements[]) {
        super(toEngineAttrs(attrs), children)
    }

    /** Replaces the values and counts them again */
    setValues(values: number[], bins?: number | number[]): void {
        this.update({data: binned(values, bins)})
    }

    protected override defaultSeriesKind(): ChartSeriesKind {
        return "bar"
    }

    protected override defaultHover(): "index" | "mark" | "nearest" {
        return "mark"
    }

    protected override barPadding(): number {
        return 0.03
    }
}
