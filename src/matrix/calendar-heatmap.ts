import { ChartFrame } from "../core/chart-frame.ts"
import { svgEl } from "../core/chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable } from "../core/chart-common.ts"
import { heatColor } from "./heatmap.ts"
import type { IdAttr, StylePassthroughAttrs } from "../core/velotype.ts"

/** One day on a `<CalendarHeatmap/>` */
export type CalendarDayType = {
    /** The day. Read in UTC, so it means the same day wherever the page is opened */
    date: Date | string
    value: number
}

/**
 * Attrs type for `<CalendarHeatmap/>` Component
 */
export type CalendarHeatmapAttrsType = {
    data: CalendarDayType[]
    /** The first day to show (default: the earliest in `data`) */
    from?: Date | string
    /** The last day to show (default: the latest in `data`) */
    to?: Date | string
    /** The day a week starts on: `0` is Sunday (default: `0`) */
    weekStart?: number
    /** The color of the highest value (default: `var(--primary)`) */
    color?: string
} & ChartBaseAttrsType & IdAttr & StylePassthroughAttrs

const DAY = 24 * 60 * 60 * 1000

function dayNumber(date: Date | string): number {
    return Math.floor(new Date(date).getTime() / DAY)
}

/** A year of daily activity as a grid of weeks, one column each. Month and day names come from the browser's language */
export class CalendarHeatmap extends ChartFrame<CalendarHeatmapAttrsType> {
    protected override isEmpty(): boolean {
        return this.chartAttrs.data.length === 0
    }

    protected override legendEntries(): {label: string, color: string}[] {
        return []
    }

    protected override dataTable(): ChartDataTable {
        const format = new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeZone: "UTC"})
        return {
            columns: ["", ""],
            rows: [...this.chartAttrs.data]
                .sort((a, b) => dayNumber(a.date) - dayNumber(b.date))
                .map(day => [format.format(new Date(dayNumber(day.date) * DAY)), this.format(day.value)]),
        }
    }

    protected override draw(svg: SVGElement, width: number, height: number): void {
        const {data, weekStart, color} = this.chartAttrs
        const byDay = new Map<number, number>()
        let min = Infinity
        let max = -Infinity
        let first = Infinity
        let last = -Infinity
        for (const day of data) {
            const number = dayNumber(day.date)
            byDay.set(number, day.value)
            if (number < first) {first = number}
            if (number > last) {last = number}
            if (day.value < min) {min = day.value}
            if (day.value > max) {max = day.value}
        }
        const from = this.chartAttrs.from !== undefined ? dayNumber(this.chartAttrs.from) : first
        const to = this.chartAttrs.to !== undefined ? dayNumber(this.chartAttrs.to) : last
        const start = weekStart ?? 0
        // 1 January 1970 was a Thursday, so a day's weekday comes straight from its number
        const weekday = (number: number) => (((number + 4 - start) % 7) + 7) % 7
        const firstColumnDay = from - weekday(from)
        const weeks = Math.floor((to - firstColumnDay) / 7) + 1
        const top = 20
        const cell = Math.max(2, Math.min((width - 30 - 2) / weeks, (height - top - 2) / 7))
        // A grid held short by its height sits in the middle of the width it doesn't fill
        const left = Math.max(30, (width - weeks * cell + 30) / 2)
        const dateFormat = new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeZone: "UTC"})
        const monthFormat = new Intl.DateTimeFormat(undefined, {month: "short", timeZone: "UTC"})
        const dayFormat = new Intl.DateTimeFormat(undefined, {weekday: "short", timeZone: "UTC"})
        const shade = color ?? "var(--primary)"

        // Every other row is named, which is as many as fit beside a small cell
        for (let row = 1; row < 7; row += 2) {
            const label = svgEl("text", {class: "vtc-chart-tick vtc-chart-tick-y", x: left - 6, y: top + cell * (row + 0.5)})
            label.textContent = dayFormat.format(new Date((firstColumnDay + row) * DAY))
            svg.appendChild(label)
        }

        const marks = svgEl("g", {class: "vtc-chart-marks-radial"})
        let lastMonth = -1
        let lastLabelX = -Infinity
        for (let number = from; number <= to; number++) {
            const column = Math.floor((number - firstColumnDay) / 7)
            const row = weekday(number)
            const x = left + column * cell
            const y = top + row * cell
            const date = new Date(number * DAY)
            const month = date.getUTCMonth()
            if (month !== lastMonth) {
                lastMonth = month
                // Far enough from the last name not to run into it, and from a full column so it is above a real week
                if (x - lastLabelX > 28) {
                    const label = svgEl("text", {class: "vtc-chart-tick vtc-chart-month-label", x, y: top - 6})
                    label.textContent = monthFormat.format(date)
                    svg.appendChild(label)
                    lastLabelX = x
                }
            }
            const value = byDay.get(number)
            if (value === undefined) {
                marks.appendChild(svgEl("rect", {class: "vtc-chart-cell vtc-chart-cell-empty", x, y, width: cell, height: cell, rx: 2}))
                continue
            }
            const fill = heatColor(max === min ? 1 : 0.12 + 0.88 * ((value - min) / (max - min)), shade)
            const rect = svgEl("rect", {class: "vtc-chart-cell", x, y, width: cell, height: cell, rx: 2, fill})
            const title = dateFormat.format(date)
            this.addMark(rect, {
                title, rows: [{label: "", value: this.format(value), color: fill}],
                anchor: {left: x, right: x + cell, y: y + cell / 2},
                detail: {label: title, index: number - from, value},
            })
            marks.appendChild(rect)
        }
        svg.appendChild(marks)
    }
}
