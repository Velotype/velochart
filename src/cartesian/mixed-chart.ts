import { CartesianFrame } from "./cartesian-frame.ts"
import type { CartesianAttrsType } from "./cartesian-frame.ts"
import type { ChartSeriesKind } from "../core/chart-common.ts"

/**
 * Attrs type for `<MixedChart/>` Component
 */
export type MixedChartAttrsType = CartesianAttrsType

/**
 * Different kinds of series on one set of axes: set each series' `type`, and `yAxis: "right"` for one
 * measured in other units. A series with no `type` is a line.
 *
 * Bars are drawn first, so a line is never hidden behind them.
 */
export class MixedChart extends CartesianFrame<MixedChartAttrsType> {
    protected override defaultSeriesKind(): ChartSeriesKind {
        return "line"
    }
}
