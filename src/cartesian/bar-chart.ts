import { CartesianFrame } from "./cartesian-frame.ts"
import type { CartesianAttrsType } from "./cartesian-frame.ts"
import type { ChartSeriesKind } from "../core/chart-common.ts"

/**
 * Attrs type for `<BarChart/>` Component
 */
export type BarChartAttrsType = CartesianAttrsType

/**
 * A bar chart: vertical or `horizontal`, with series side by side or `stacked`.
 *
 * A negative value hangs below the zero line, and in a stack the negatives build downward from zero
 * while the positives build upward, so neither hides the other.
 */
export class BarChart extends CartesianFrame<BarChartAttrsType> {
    protected override defaultSeriesKind(): ChartSeriesKind {
        return "bar"
    }

    protected override defaultHover(): "index" | "mark" | "nearest" {
        return "mark"
    }
}
