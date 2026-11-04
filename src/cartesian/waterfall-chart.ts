import { CartesianFrame } from "./cartesian-frame.ts"
import type { CartesianAttrsType, CartesianPlot } from "./cartesian-frame.ts"
import { svgEl } from "../core/chart-common.ts"
import type { ChartSeriesKind } from "../core/chart-common.ts"
import type { RenderableElements } from "../core/velotype.ts"

/** One step of a `<WaterfallChart/>` */
export type WaterfallStepType = {
    label: string
    /** How much this step adds or takes away. On a `total`, the value is ignored unless it is the first step */
    value: number
    /** Draws the running total from zero rather than a step, for a subtotal or the end (default: `false`) */
    total?: boolean
}

/**
 * Attrs type for `<WaterfallChart/>` Component
 */
export type WaterfallChartAttrsType = Omit<CartesianAttrsType, "data" | "series" | "stacked" | "horizontal" | "showDots" | "spanGaps" | "xAxis"> & {
    data: WaterfallStepType[]
    /** A CSS color for steps up (default: `var(--secondary)`) */
    increaseColor?: string
    /** A CSS color for steps down (default: `var(--accent)`) */
    decreaseColor?: string
    /** A CSS color for totals (default: `var(--primary)`) */
    totalColor?: string
}

function toEngineAttrs(attrs: WaterfallChartAttrsType): CartesianAttrsType & WaterfallChartAttrsType {
    return {
        ...attrs,
        data: attrs.data.map(step => ({...step, values: {value: step.value}})),
        series: [{key: "value", type: "none"}],
    } as unknown as CartesianAttrsType & WaterfallChartAttrsType
}

/**
 * How a start becomes an end through a series of gains and losses, each step hanging from where the
 * last one finished, with a thin line between them so the eye can follow the running total.
 */
export class WaterfallChart extends CartesianFrame<CartesianAttrsType & WaterfallChartAttrsType> {
    constructor(attrs: WaterfallChartAttrsType, children: RenderableElements[]) {
        super(toEngineAttrs(attrs), children)
    }

    /** Replaces the steps */
    setSteps(data: WaterfallStepType[]): void {
        this.update(toEngineAttrs({...this.chartAttrs, data}))
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

    protected override seriesSetAxis(): boolean {
        return false
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return []
    }

    /** The running total before and after each step */
    #levels(): {from: number, to: number}[] {
        let running = 0
        return (this.chartAttrs.data as unknown as WaterfallStepType[]).map(step => {
            if (step.total) {
                return {from: 0, to: running}
            }
            const from = running
            running += step.value
            return {from, to: running}
        })
    }

    protected override extraValues(): number[] {
        return [0, ...this.#levels().flatMap(level => [level.from, level.to])]
    }

    protected override drawCustom(parent: SVGElement, plot: CartesianPlot): void {
        const attrs = this.chartAttrs
        const steps = attrs.data as unknown as WaterfallStepType[]
        const levels = this.#levels()
        const width = Math.max(1, plot.slot * 0.7)
        let previousEnd: {x: number, y: number} | undefined
        for (const row of plot.rows) {
            const step = steps[row.index]
            const level = levels[row.index]
            const x = plot.mapX(row.x)
            const top = plot.mapY(Math.max(level.from, level.to))
            const bottom = plot.mapY(Math.min(level.from, level.to))
            if (previousEnd) {
                parent.appendChild(svgEl("line", {class: "vtc-chart-spoke", x1: previousEnd.x, y1: previousEnd.y, x2: x - width / 2, y2: previousEnd.y}))
            }
            const color = step.total
                ? attrs.totalColor ?? "var(--primary)"
                : step.value >= 0 ? attrs.increaseColor ?? "var(--secondary)" : attrs.decreaseColor ?? "var(--accent)"
            const rect = svgEl("rect", {class: "vtc-chart-bar", x: x - width / 2, y: top, width, height: Math.max(1, bottom - top), fill: color, rx: 2})
            const amount = step.total ? level.to : step.value
            this.addMark(rect, {
                title: step.label,
                rows: [{label: "", value: this.format(amount), color}],
                anchor: {left: x - width / 2, right: x + width / 2, y: top},
                detail: {label: step.label, index: row.index, value: amount},
            })
            parent.appendChild(rect)
            previousEnd = {x: x + width / 2, y: plot.mapY(level.to)}
        }
    }
}
