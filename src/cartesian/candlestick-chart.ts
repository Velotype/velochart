import { CartesianFrame } from "./cartesian-frame.ts"
import type { CartesianAttrsType, CartesianPlot } from "./cartesian-frame.ts"
import { svgEl } from "../core/chart-common.ts"
import type { ChartPointType, ChartSeriesKind } from "../core/chart-common.ts"
import type { RenderableElements } from "../core/velotype.ts"

/** One period on a `<CandlestickChart/>` */
export type CandlestickPointType = {
    /** Where it sits on a time or numeric axis. Unset, the periods are categories in the order given */
    x?: number | Date
    /** Names the period when `x` isn't set */
    label?: string
    open: number
    high: number
    low: number
    close: number
}

/**
 * Attrs type for `<CandlestickChart/>` Component
 */
export type CandlestickChartAttrsType = Omit<CartesianAttrsType, "data" | "series" | "stacked" | "horizontal" | "showDots" | "spanGaps"> & {
    data: CandlestickPointType[]
    /** `"candle"` fills the body between open and close; `"ohlc"` draws ticks on one line (default: `"candle"`) */
    variant?: "candle" | "ohlc"
    /** A CSS color for a period closing higher (default: `var(--secondary)`) */
    upColor?: string
    /** A CSS color for a period closing lower (default: `var(--accent)`) */
    downColor?: string
    /** What open, high, low and close are called in the tooltip and the hidden table (default: O, H, L, C) */
    labels?: {open: string, high: string, low: string, close: string}
}

function toEngineAttrs(attrs: CandlestickChartAttrsType): CartesianAttrsType & {variant?: "candle" | "ohlc", upColor?: string, downColor?: string} {
    const labels = attrs.labels ?? {open: "O", high: "H", low: "L", close: "C"}
    return {
        beginAtZero: false,
        hideLegend: true,
        ...attrs,
        data: attrs.data.map((point): ChartPointType => ({
            x: point.x, label: point.label,
            values: {open: point.open, high: point.high, low: point.low, close: point.close},
        })),
        series: (["open", "high", "low", "close"] as const).map(key => ({key, label: labels[key], type: "none"})),
    }
}

/**
 * How a price moved over each period: its range and where it opened and closed. A reader can zoom and
 * pan it as any chart on these axes, and hovering reads all four numbers for the period nearest.
 */
export class CandlestickChart extends CartesianFrame<CartesianAttrsType & {variant?: "candle" | "ohlc", upColor?: string, downColor?: string}> {
    constructor(attrs: CandlestickChartAttrsType, children: RenderableElements[]) {
        super(toEngineAttrs(attrs), children)
    }

    /** Replaces the periods */
    setPeriods(data: CandlestickPointType[]): void {
        this.update({data: toEngineAttrs({...this.chartAttrs, data} as CandlestickChartAttrsType).data})
    }

    protected override defaultSeriesKind(): ChartSeriesKind {
        return "none"
    }

    protected override padsX(): boolean {
        return true
    }

    protected override drawCustom(parent: SVGElement, plot: CartesianPlot): void {
        const {variant, upColor, downColor} = this.chartAttrs
        const width = Math.max(1, plot.slot * 0.7)
        for (const row of plot.rows) {
            const {open, high, low, close} = row.point.values
            if (open === undefined || high === undefined || low === undefined || close === undefined) {
                continue
            }
            const color = close >= open ? upColor ?? "var(--secondary)" : downColor ?? "var(--accent)"
            const x = plot.mapX(row.x)
            const openY = plot.mapY(open)
            const closeY = plot.mapY(close)
            if (variant === "ohlc") {
                parent.appendChild(svgEl("path", {
                    class: "vtc-chart-whisker vtc-chart-candle", stroke: color,
                    d: `M ${x} ${plot.mapY(high)} V ${plot.mapY(low)} M ${x - width / 2} ${openY} H ${x} M ${x} ${closeY} H ${x + width / 2}`,
                }))
            } else {
                parent.appendChild(svgEl("line", {class: "vtc-chart-whisker vtc-chart-candle-wick", x1: x, x2: x, y1: plot.mapY(high), y2: plot.mapY(low), stroke: color}))
                parent.appendChild(svgEl("rect", {
                    class: "vtc-chart-candle", x: x - width / 2, y: Math.min(openY, closeY),
                    width, height: Math.max(1, Math.abs(openY - closeY)), fill: color,
                }))
            }
        }
    }
}
