import { passthroughAttrsToElement } from "../core/velotype.ts"
import type { FunctionComponent, IdAttr, RenderableElements, StylePassthroughAttrs } from "../core/velotype.ts"
import { mountChartStyles, svgEl } from "../core/chart-common.ts"

/** How a `<Sparkline/>` draws its values */
export type SparklineVariant = "line" | "area" | "bar"

/**
 * Attrs type for `<Sparkline/>` Component
 */
export type SparklineAttrsType = {
    /** The values, oldest first */
    values: number[]
    /** How to draw them (default: `"line"`) */
    variant?: SparklineVariant
    /** Width in px (default: `120`) */
    width?: number
    /** Height in px (default: `28`) */
    height?: number
    /** CSS color for the stroke or fill (default: `var(--primary)`) */
    color?: string
    /** Emphasises the most recent value with a dot (default: `true` for line/area) */
    showLast?: boolean
    /**
     * Accessible name. No default - this package doesn't assume a language.
     *
     * A sparkline usually sits next to the number it describes, and in that case the number is the
     * accessible content and this can stay unset; set it when the sparkline stands alone.
     */
    ariaLabel?: string
} & IdAttr & StylePassthroughAttrs

/**
 * A tiny, axis-less trend line, sized to sit inside a line of text or a table cell.
 *
 * Ant Design calls this family TinyLine/TinyArea/TinyColumn; the idea is the same one Tufte named -
 * a chart small enough to be punctuation. It deliberately has no axes, no legend, no tooltip and no
 * resize handling: it is a fixed-size glyph, and the surrounding text or table cell carries
 * the numbers. Reach for `LineChart` the moment a reader needs to know *which* value is which.
 */
export const Sparkline: FunctionComponent<SparklineAttrsType> = function(attrs: SparklineAttrsType, _children: RenderableElements[]): HTMLSpanElement {
    mountChartStyles()
    const width = attrs.width ?? 120
    const height = attrs.height ?? 28
    const variant = attrs.variant ?? "line"
    const color = attrs.color ?? "var(--primary)"
    const values = attrs.values.filter(v => Number.isFinite(v))

    const svg = svgEl("svg", {
        class: "vtc-chart-svg",
        width, height, viewBox: `0 0 ${width} ${height}`, role: "img"
    })
    svg.setAttribute("style", `width:${width}px;height:${height}px;`)
    if (attrs.ariaLabel !== undefined) {
        svg.setAttribute("aria-label", attrs.ariaLabel)
    } else {
        // Without a name it is decoration, and announcing an unlabeled graphic is worse than
        // skipping it - the value it illustrates is already in the text beside it.
        svg.setAttribute("aria-hidden", "true")
    }

    if (values.length > 0) {
        const min = Math.min(...values)
        const max = Math.max(...values)
        const span = max - min
        // Inset by the stroke so the extremes aren't clipped at the top and bottom edges
        const pad = 2
        const toY = (value: number) => span === 0
            ? height / 2
            : height - pad - ((value - min) / span) * (height - pad * 2)

        if (variant === "bar") {
            const slot = width / values.length
            const barWidth = Math.max(1, slot - 1)
            const zeroY = height - pad
            values.forEach((value, index) => {
                const y = toY(value)
                svg.appendChild(svgEl("rect", {
                    x: slot * index, y, width: barWidth, height: Math.max(1, zeroY - y), fill: color, rx: 1
                }))
            })
        } else {
            const step = values.length === 1 ? 0 : width / (values.length - 1)
            const points = values.map((value, index) => ({x: step * index, y: toY(value)}))
            const line = `M ${points.map(p => `${p.x} ${p.y}`).join(" L ")}`
            if (variant === "area") {
                svg.appendChild(svgEl("path", {
                    class: "vtc-chart-area",
                    d: `${line} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`,
                    fill: color
                }))
            }
            svg.appendChild(svgEl("path", {class: "vtc-chart-line", d: line, stroke: color}))
            if (attrs.showLast ?? true) {
                const last = points[points.length - 1]
                svg.appendChild(svgEl("circle", {class: "vtc-chart-dot", cx: last.x, cy: last.y, r: 2.5, fill: color}))
            }
        }
    }

    // Wrapped in a span rather than returned bare: `passthroughAttrsToElement` is declared over
    // HTMLElement, and an SVG root would need a double cast. A sparkline is
    // inline content anyway, so a span is the honest box for it.
    const wrapper = document.createElement("span")
    wrapper.className = "vtc-sparkline"
    wrapper.appendChild(svg)
    return passthroughAttrsToElement<HTMLSpanElement>(wrapper, attrs)
}
