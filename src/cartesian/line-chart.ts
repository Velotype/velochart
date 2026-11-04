import { CartesianFrame } from "./cartesian-frame.ts"
import type { CartesianAttrsType } from "./cartesian-frame.ts"
import type { ChartSeriesKind } from "../core/chart-common.ts"
import type { RenderableElements } from "../core/velotype.ts"

/**
 * Attrs type for `<LineChart/>` and `<AreaChart/>`
 */
export type LineChartAttrsType = {
    /** Fills the space under each line (default: `false` - `AreaChart` sets it) */
    area?: boolean
} & CartesianAttrsType

/**
 * A line chart, optionally filled (`area`) and optionally `stacked`.
 *
 * Hovering anywhere over the plot highlights the nearest point and shows every series' value at it,
 * rather than requiring the pointer to land on a 2px line. That is the one interaction detail that
 * decides whether a line chart is usable at all.
 */
export class LineChart extends CartesianFrame<LineChartAttrsType> {
    protected override defaultSeriesKind(): ChartSeriesKind {
        return this.chartAttrs.area ? "area" : "line"
    }
}

/**
 * Attrs type for `<AreaChart/>` Component - identical to `LineChart`'s, minus `area`, which is
 * what this component sets.
 */
export type AreaChartAttrsType = Omit<LineChartAttrsType, "area">

/**
 * A filled line chart. Exactly `LineChart` with `area` set - a separate component because "area
 * chart" is the name people look for, and because `stacked` reads as meaningful here and merely
 * odd on a bare line.
 */
export class AreaChart extends LineChart {
    constructor(attrs: AreaChartAttrsType, children: RenderableElements[]) {
        super({...attrs, area: true}, children)
    }
}
