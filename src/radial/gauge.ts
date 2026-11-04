import { ChartFrame } from "../core/chart-frame.ts"
import { svgEl } from "../core/chart-common.ts"
import { arcPath } from "./pie-chart.ts"
import type { ChartBaseAttrsType, ChartDataTable } from "../core/chart-common.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/** A coloured band along a gauge's track, for marking good/warning/critical ranges */
export type GaugeBandType = {
    /** Where the band starts, in the gauge's own value units */
    from: number
    /** Where it ends */
    to: number
    /** CSS color for the band */
    color: string
}

/**
 * Attrs type for `<Gauge/>` Component
 */
export type GaugeAttrsType = {
    /** The value to show */
    value: number
    /** Bottom of the range (default: `0`) */
    min?: number
    /** Top of the range (default: `100`) */
    max?: number
    /**
     * How much of a circle the track spans, in degrees (default: `240`).
     *
     * `240` is the familiar speedometer sweep; `180` is a half-circle, which fits better in a wide,
     * short tile.
     */
    sweep?: number
    /** Ranges to tint along the track, e.g. a red zone near the top */
    bands?: GaugeBandType[]
    /** Colour of the value arc when no `bands` apply (default: `var(--primary)`) */
    color?: string
    /** Large text in the middle (default: the formatted value) */
    label?: string
    /** Smaller text under the label */
    subLabel?: string
    /** Draws the min and max at the ends of the track (default: `true`) */
    showRange?: boolean
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

/**
 * A radial gauge: one value against a range, optionally with coloured bands.
 *
 * For a figure that has a *meaningful maximum and shape* - a rate, a utilisation, a score - where
 * "how close to the top" matters more than "how far along". A task completing wants a progress bar;
 * this is for a level being watched.
 */
export class Gauge extends ChartFrame<GaugeAttrsType> {
    /** The value the arc is drawn at, on its way to `value` during an update */
    #shownValue: number | undefined

    protected override attrsChanged(changed: Partial<GaugeAttrsType>): void {
        const from = this.#shownValue
        const to = changed.value
        if (to === undefined || from === undefined) {
            return
        }
        this.tween(300, (progress) => {
            this.#shownValue = from + (to - from) * progress
        })
    }

    protected override isEmpty(): boolean {
        return !Number.isFinite(this.chartAttrs.value)
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return []
    }

    /**
     * No table: a gauge is one number against a range, which `ariaLabel` states directly. A
     * one-row table would be more structure to navigate for less information than the label.
     */
    protected override dataTable(): ChartDataTable | undefined {
        return undefined
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const attrs = this.chartAttrs
        const min = attrs.min ?? 0
        const max = attrs.max ?? 100
        const span = max - min || 1
        const sweepDegrees = Math.min(360, Math.max(30, attrs.sweep ?? 240))
        const sweep = (sweepDegrees * Math.PI) / 180
        // Centred on the downward axis so the gap sits at the bottom, speedometer-style
        const start = Math.PI / 2 + (Math.PI * 2 - sweep) / 2
        const end = start + sweep

        const cx = width / 2
        // A gauge with a bottom gap is visually top-heavy; nudge the centre down so the drawing
        // sits in the middle of its box rather than the circle's centre doing so.
        const cy = height / 2 + (sweepDegrees < 300 ? height * 0.08 : 0)
        const radius = Math.max(1, Math.min(width / 2, height / 2 + height * 0.08) - 4)
        const thickness = Math.max(6, radius * 0.22)
        const inner = radius - thickness

        const toAngle = (value: number) => start + ((Math.min(max, Math.max(min, value)) - min) / span) * sweep

        svg.appendChild(svgEl("path", {
            d: arcPath(cx, cy, radius, inner, start, end), fill: "var(--background-3)"
        }))

        for (const band of attrs.bands ?? []) {
            const from = toAngle(band.from)
            const to = toAngle(band.to)
            if (to <= from) {
                continue
            }
            svg.appendChild(svgEl("path", {d: arcPath(cx, cy, radius, inner, from, to), fill: band.color, opacity: 0.5}))
        }

        // The value arc is inset within the track rather than filling it, so the bands underneath
        // stay visible as a rim on both edges. Drawn full-thickness it covers them completely,
        // which makes `bands` look like it does nothing.
        const inset = (attrs.bands?.length ?? 0) > 0 ? thickness * 0.28 : 0
        this.#shownValue ??= attrs.value
        const valueAngle = toAngle(this.#shownValue)
        if (valueAngle > start) {
            svg.appendChild(svgEl("path", {
                class: "vtc-chart-arc",
                d: arcPath(cx, cy, radius - inset, inner + inset, start, valueAngle),
                fill: this.#valueColor(attrs.value)
            }))
        }

        const label = svgEl("text", {
            x: cx, y: attrs.subLabel === undefined ? cy : cy - 8,
            "text-anchor": "middle", "dominant-baseline": "middle",
            fill: "var(--text)", "font-size": Math.max(14, inner * 0.5), "font-weight": "bold"
        })
        label.textContent = attrs.label ?? this.format(attrs.value)
        svg.appendChild(label)

        if (attrs.subLabel !== undefined) {
            const sub = svgEl("text", {
                class: "vtc-chart-tick", x: cx, y: cy + Math.max(14, inner * 0.32),
                "text-anchor": "middle", "dominant-baseline": "middle"
            })
            sub.textContent = attrs.subLabel
            svg.appendChild(sub)
        }

        if (attrs.showRange ?? true) {
            const mid = radius - thickness / 2
            for (const [value, angle] of [[min, start], [max, end]] as [number, number][]) {
                const tick = svgEl("text", {
                    class: "vtc-chart-tick",
                    x: cx + Math.cos(angle) * mid, y: cy + Math.sin(angle) * mid + 18,
                    "text-anchor": "middle", "dominant-baseline": "middle"
                })
                tick.textContent = this.format(value)
                svg.appendChild(tick)
            }
        }
    }

    /** A band containing the value wins, so the arc itself carries the good/bad reading */
    #valueColor(value: number): string {
        for (const band of this.chartAttrs.bands ?? []) {
            if (value >= band.from && value <= band.to) {
                return band.color
            }
        }
        return this.chartAttrs.color ?? "var(--primary)"
    }
}
