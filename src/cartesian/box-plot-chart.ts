import { CartesianFrame } from "./cartesian-frame.ts"
import type { CartesianAttrsType, CartesianPlot } from "./cartesian-frame.ts"
import { seriesColor, svgEl } from "../core/chart-common.ts"
import type { ChartPointType, ChartSeriesKind } from "../core/chart-common.ts"
import type { RenderableElements } from "../core/velotype.ts"

/** The five numbers a box is drawn from, and anything past its whiskers */
export type BoxSummaryType = {
    min: number
    q1: number
    median: number
    q3: number
    max: number
    outliers?: number[]
}

/** One box: its raw values to summarize, or a summary worked out already */
export type BoxPlotEntryType = {label: string, color?: string} & ({values: number[]} | {summary: BoxSummaryType})

/** What the five numbers are called in the tooltip and the hidden table */
export type BoxPlotLabelsType = {min: string, q1: string, median: string, q3: string, max: string}

/**
 * Attrs type for `<BoxPlotChart/>` Component
 */
export type BoxPlotChartAttrsType = Omit<CartesianAttrsType, "data" | "series" | "stacked" | "horizontal" | "showDots" | "spanGaps" | "xAxis"> & {
    data: BoxPlotEntryType[]
    /** Names for the five numbers. The defaults are symbols, because the package assumes no language */
    labels?: BoxPlotLabelsType
}

function quantile(sorted: number[], fraction: number): number {
    const position = (sorted.length - 1) * fraction
    const below = Math.floor(position)
    const above = Math.ceil(position)
    return sorted[below] + (sorted[above] - sorted[below]) * (position - below)
}

/** Tukey's box: whiskers reach the furthest value within 1.5 box-lengths, and the rest are outliers */
export function summarize(values: number[]): BoxSummaryType | undefined {
    const sorted = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b)
    if (sorted.length === 0) {
        return undefined
    }
    const q1 = quantile(sorted, 0.25)
    const q3 = quantile(sorted, 0.75)
    const reach = (q3 - q1) * 1.5
    const inside = sorted.filter(value => value >= q1 - reach && value <= q3 + reach)
    return {
        min: inside[0], q1, median: quantile(sorted, 0.5), q3, max: inside[inside.length - 1],
        outliers: sorted.filter(value => value < q1 - reach || value > q3 + reach),
    }
}

const SYMBOLS: BoxPlotLabelsType = {min: "↓", q1: "Q1", median: "x̃", q3: "Q3", max: "↑"}

function toEngineAttrs(attrs: BoxPlotChartAttrsType): CartesianAttrsType {
    const labels = attrs.labels ?? SYMBOLS
    const keys = ["min", "q1", "median", "q3", "max"] as const
    return {
        beginAtZero: false,
        ...attrs,
        data: attrs.data.map((entry): ChartPointType => {
            const summary = "summary" in entry ? entry.summary : summarize(entry.values)
            return {label: entry.label, values: summary ? {min: summary.min, q1: summary.q1, median: summary.median, q3: summary.q3, max: summary.max} : {}}
        }),
        series: keys.map(key => ({key, label: labels[key], type: "none"})),
    }
}

/**
 * How several groups' values are spread: the box holds the middle half, the line in it is the median,
 * the whiskers reach the furthest values that aren't outliers, and outliers are drawn one by one.
 */
export class BoxPlotChart extends CartesianFrame<CartesianAttrsType> {
    #entries: BoxPlotEntryType[]

    constructor(attrs: BoxPlotChartAttrsType, children: RenderableElements[]) {
        super(toEngineAttrs(attrs), children)
        this.#entries = attrs.data
    }

    /** Replaces the groups */
    setEntries(data: BoxPlotEntryType[], labels?: BoxPlotLabelsType): void {
        this.#entries = data
        this.update(toEngineAttrs({...this.chartAttrs, data, labels} as BoxPlotChartAttrsType))
    }

    #summary(entry: BoxPlotEntryType): BoxSummaryType | undefined {
        return "summary" in entry ? entry.summary : summarize(entry.values)
    }

    protected override defaultSeriesKind(): ChartSeriesKind {
        return "none"
    }

    protected override defaultHover(): "index" | "mark" | "nearest" {
        return "mark"
    }

    protected override padsX(): boolean {
        return true
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return []
    }

    protected override extraValues(): number[] {
        return (this.#entries ?? []).flatMap(entry => this.#summary(entry)?.outliers ?? [])
    }

    protected override drawCustom(parent: SVGElement, plot: CartesianPlot): void {
        const {series} = this.chartAttrs
        const width = Math.max(4, Math.min(plot.slot * 0.5, 80))
        for (const row of plot.rows) {
            const entry = this.#entries[row.index]
            const summary = this.#summary(entry)
            if (!summary) {
                continue
            }
            const color = seriesColor(row.index, entry.color)
            const x = plot.mapX(row.x)
            const q1 = plot.mapY(summary.q1)
            const q3 = plot.mapY(summary.q3)
            const top = plot.mapY(summary.max)
            const bottom = plot.mapY(summary.min)
            const median = plot.mapY(summary.median)
            const cap = width / 4
            parent.appendChild(svgEl("path", {
                class: "vtc-chart-whisker", stroke: color,
                d: `M ${x} ${q3} V ${top} M ${x - cap} ${top} H ${x + cap} M ${x} ${q1} V ${bottom} M ${x - cap} ${bottom} H ${x + cap}`,
            }))
            const box = svgEl("rect", {
                class: "vtc-chart-bar", x: x - width / 2, y: Math.min(q1, q3), width, height: Math.max(1, Math.abs(q1 - q3)),
                fill: color, "fill-opacity": 0.3, stroke: color, "stroke-width": 1.5,
            })
            this.addMark(box, {
                title: entry.label,
                rows: series.map(s => ({label: s.label ?? s.key, value: this.format(row.point.values[s.key] ?? 0)})),
                anchor: {left: x - width / 2, right: x + width / 2, y: Math.min(q1, q3)},
                detail: {label: entry.label, index: row.index, value: summary.median},
            })
            parent.appendChild(box)
            parent.appendChild(svgEl("line", {class: "vtc-chart-whisker", x1: x - width / 2, x2: x + width / 2, y1: median, y2: median, stroke: color}))
            for (const outlier of summary.outliers ?? []) {
                parent.appendChild(svgEl("circle", {class: "vtc-chart-outlier", cx: x, cy: plot.mapY(outlier), r: 3, fill: "none", stroke: color, "stroke-width": 1.5}))
            }
        }
    }
}
