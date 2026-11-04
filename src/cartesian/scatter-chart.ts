import { CartesianFrame } from "./cartesian-frame.ts"
import type { CartesianAttrsType } from "./cartesian-frame.ts"
import type { ChartPointType, ChartSeriesKind, ChartSeriesType } from "../core/chart-common.ts"
import type { RenderableElements } from "../core/velotype.ts"

/** One point on a `<ScatterChart/>` or `<BubbleChart/>` */
export type ScatterPointType = {
    x: number | Date
    y: number
    /** Named in the tooltip. Its position is shown when this is unset */
    label?: string
    /** A bubble's size, which its area follows. Only `BubbleChart` reads it */
    size?: number
}

/** One series of points. Unlike a line's, these need not share their x positions with other series */
export type ScatterSeriesType = Omit<ChartSeriesType, "type" | "curve" | "dashed"> & {points: ScatterPointType[]}

/**
 * Attrs type for `<ScatterChart/>` Component
 */
export type ScatterChartAttrsType = Omit<CartesianAttrsType, "data" | "series" | "stacked" | "horizontal" | "showDots" | "spanGaps"> & {
    series: ScatterSeriesType[]
}

/** Each point becomes its own row, holding one series' value: series are free to differ in their x */
function toRows(series: ScatterSeriesType[]): ChartPointType[] {
    return series.flatMap(entry => entry.points.map(point => ({x: point.x, label: point.label, values: {[entry.key]: point.y}})))
}

function toEngineAttrs(attrs: ScatterChartAttrsType): CartesianAttrsType {
    return {
        beginAtZero: false,
        ...attrs,
        data: toRows(attrs.series),
        series: attrs.series.map(({points: _points, ...rest}) => rest),
    }
}

/**
 * Points placed by two values, for how one thing varies with another. A pointer reads the one point
 * nearest it, and the value axis follows the data rather than starting at zero, since a scatter is
 * about relationships and not magnitudes.
 */
export class ScatterChart extends CartesianFrame<CartesianAttrsType> {
    constructor(attrs: ScatterChartAttrsType, children: RenderableElements[]) {
        super(toEngineAttrs(attrs), children)
    }

    protected override defaultSeriesKind(): ChartSeriesKind {
        return "scatter"
    }

    protected override defaultHover(): "index" | "mark" | "nearest" {
        return "nearest"
    }

    /** Replaces the points, keeping what the reader has hidden */
    setSeries(series: ScatterSeriesType[]): void {
        this.update(toEngineAttrs({...this.chartAttrs, series}))
    }
}

/**
 * Attrs type for `<BubbleChart/>` Component
 */
export type BubbleChartAttrsType = ScatterChartAttrsType & {
    /** The radius in px of the largest bubble (default: `24`) */
    maxRadius?: number
}

/**
 * A scatter chart whose points also show a third value by their size. **Area follows the value, not
 * radius**: the eye reads a bubble by its area, so a radius that doubled would claim four times as much.
 */
export class BubbleChart extends ScatterChart {
    #sizes = new Map<ChartPointType, number>()
    #largest = 0
    #maxRadius: number

    constructor(attrs: BubbleChartAttrsType, children: RenderableElements[]) {
        super(attrs, children)
        this.#maxRadius = attrs.maxRadius ?? 24
        this.#readSizes(attrs.series, this.chartAttrs.data)
    }

    /** The engine's rows were built in the same order as these points, so they pair up by position */
    #readSizes(series: ScatterSeriesType[], rows: ChartPointType[]): void {
        this.#sizes = new Map()
        this.#largest = 0
        let position = 0
        for (const entry of series) {
            for (const point of entry.points) {
                const size = Math.max(0, point.size ?? 0)
                this.#sizes.set(rows[position++], size)
                this.#largest = Math.max(this.#largest, size)
            }
        }
    }

    override setSeries(series: ScatterSeriesType[]): void {
        const attrs = toEngineAttrs({...this.chartAttrs, series})
        this.#readSizes(series, attrs.data)
        this.update(attrs)
    }

    protected override pointRadius(point: ChartPointType, _series: ChartSeriesType): number {
        const size = this.#sizes.get(point) ?? 0
        return this.#largest === 0 ? 4 : Math.max(2, Math.sqrt(size / this.#largest) * this.#maxRadius)
    }
}
