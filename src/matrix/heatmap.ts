import { ChartFrame } from "../core/chart-frame.ts"
import { svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable } from "../core/chart-common.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/**
 * Attrs type for `<Heatmap/>` Component
 */
export type HeatmapAttrsType = {
    /** Column names, left to right */
    columns: string[]
    /** Row names, top to bottom */
    rows: string[]
    /** `values[row][column]`. A missing value is an empty cell, never a zero */
    values: (number | undefined)[][]
    /** The color of the highest value (default: `var(--primary)`) */
    color?: string
    /** Runs from `negativeColor` through the background to `color`, around zero (default: from the background up) */
    diverging?: boolean
    /** The color of the lowest value when `diverging` (default: `var(--accent)`) */
    negativeColor?: string
    /** Writes each value in its cell (default: `false`) */
    showValues?: boolean
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

/** A cell's color: a share of `color` mixed into the page's own surface, so it follows the theme */
export function heatColor(share: number, color: string): string {
    return `color-mix(in srgb, ${color} ${Math.round(Math.min(1, Math.max(0, share)) * 100)}%, var(--background-1))`
}

/**
 * Values in a grid of two categories, read by color. A scale under it says what the colors mean, since
 * a color has no value of its own to read off.
 */
export class Heatmap extends ChartFrame<HeatmapAttrsType> {
    #extent(): {min: number, max: number} {
        let min = Infinity
        let max = -Infinity
        for (const row of this.chartAttrs.values) {
            for (const value of row) {
                if (value !== undefined && Number.isFinite(value)) {
                    if (value < min) {min = value}
                    if (value > max) {max = value}
                }
            }
        }
        return {min, max}
    }

    protected override isEmpty(): boolean {
        return this.#extent().min === Infinity
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return []
    }

    protected override dataTable(): ChartDataTable {
        const {columns, rows, values} = this.chartAttrs
        return {
            columns: ["", ...columns],
            rows: rows.map((name, r) => [name, ...columns.map((_, c) => {
                const value = values[r]?.[c]
                return value === undefined ? "" : this.format(value)
            })]),
        }
    }

    #colorOf(value: number, min: number, max: number): string {
        const {color, diverging, negativeColor} = this.chartAttrs
        const positive = color ?? "var(--primary)"
        if (diverging) {
            const reach = Math.max(Math.abs(min), Math.abs(max)) || 1
            return value >= 0 ? heatColor(value / reach, positive) : heatColor(-value / reach, negativeColor ?? "var(--accent)")
        }
        // Never quite the bare surface, so the lowest value still reads as a value and not as an empty cell
        return heatColor(max === min ? 1 : 0.08 + 0.92 * ((value - min) / (max - min)), positive)
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const {columns, rows, values, showValues} = this.chartAttrs
        const {min, max} = this.#extent()
        const longest = rows.reduce((n, row) => Math.max(n, row.length), 0)
        const left = Math.min(width * 0.35, longest * 7 + 12)
        const top = 22
        const bottom = 28
        const plotWidth = Math.max(1, width - left - 4)
        const plotHeight = Math.max(1, height - top - bottom)
        const cellWidth = plotWidth / Math.max(1, columns.length)
        const cellHeight = plotHeight / Math.max(1, rows.length)
        const stride = Math.max(1, Math.ceil(columns.reduce((n, column) => Math.max(n, column.length), 0) * 7.5 / cellWidth))
        columns.forEach((column, c) => {
            if (c % stride === 0) {
                const label = svgEl("text", {class: "vtc-chart-tick vtc-chart-tick-x", x: left + cellWidth * (c + 0.5), y: top - 8})
                label.textContent = column
                svg.appendChild(label)
            }
        })
        const rowStride = Math.max(1, Math.ceil(14 / cellHeight))
        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        rows.forEach((row, r) => {
            if (r % rowStride === 0) {
                const label = svgEl("text", {class: "vtc-chart-tick vtc-chart-tick-y", x: left - 6, y: top + cellHeight * (r + 0.5)})
                label.textContent = row
                svg.appendChild(label)
            }
            columns.forEach((column, c) => {
                const value = values[r]?.[c]
                const x = left + cellWidth * c
                const y = top + cellHeight * r
                if (value === undefined || !Number.isFinite(value)) {
                    marks.appendChild(svgEl("rect", {class: "vtc-chart-cell vtc-chart-cell-empty", x, y, width: cellWidth, height: cellHeight}))
                    return
                }
                const fill = this.#colorOf(value, min, max)
                const cell = svgEl("rect", {class: "vtc-chart-cell", x, y, width: cellWidth, height: cellHeight, fill})
                this.addMark(cell, {
                    title: `${row} · ${column}`,
                    rows: [{label: "", value: this.format(value), color: fill}],
                    anchor: {left: x, right: x + cellWidth, y: y + cellHeight / 2},
                    detail: {label: `${row} · ${column}`, index: r * columns.length + c, value},
                })
                marks.appendChild(cell)
                if (showValues && cellWidth > 24 && cellHeight > 14) {
                    const text = svgEl("text", {class: "vtc-chart-cell-label", x: x + cellWidth / 2, y: y + cellHeight / 2})
                    text.textContent = this.format(value)
                    marks.appendChild(text)
                }
            })
        })
        svg.appendChild(marks)

        const scaleWidth = Math.min(120, plotWidth / 2)
        const scaleX = left + plotWidth / 2 - scaleWidth / 2
        const scaleY = top + plotHeight + 10
        const steps = 12
        for (let i = 0; i < steps; i++) {
            const value = min + ((max - min) * i) / (steps - 1)
            svg.appendChild(svgEl("rect", {
                class: "vtc-chart-scale-step", x: scaleX + (scaleWidth / steps) * i, y: scaleY,
                width: scaleWidth / steps + 0.5, height: 8,
                fill: this.#colorOf(value, min, max),
            }))
        }
        const end = (x: number, text: string, anchor: string) => {
            const label = svgEl("text", {class: "vtc-chart-tick", x, y: scaleY + 8, "text-anchor": anchor})
            label.textContent = text
            svg.appendChild(label)
        }
        end(scaleX - 6, this.format(min), "end")
        end(scaleX + scaleWidth + 6, this.format(max), "start")
    }
}
