import type { RenderableElements } from "@velotype/velotype"

import { Stack, Text } from "@velotype/velodesign"
import {
    AreaChart, BarChart, BoxPlotChart, BubbleChart, CalendarHeatmap, CandlestickChart, FunnelChart, Gauge, Heatmap, HistogramChart,
    LineChart, MixedChart, PieChart, PolarAreaChart, RadarChart, SankeyChart, ScatterChart, Sparkline, SunburstChart, Treemap, WaterfallChart,
} from "@velotype/velochart"

/**
 * Everything the showcase says about each chart: one list of names and groups, and the descriptions,
 * attribute tables, named types and live examples keyed by name.
 */

/** One row in a chart's attribute reference table */
export type AttrDoc = {
    name: string
    type: string
    /** Whether the chart needs this to be passed. Optional is the default and carries no marker */
    required?: boolean
    /** What the chart uses when the attr is not passed; omitted means there is no default */
    defaultValue?: string
    description: string
}

/**
 * One labeled variant shown on a chart's page.
 *
 * `node` is a factory, not a precomputed value, so every place that shows an example gets its own
 * freshly-constructed instance. A JSX value is a real element built once: embedding it in a second
 * place moves it rather than cloning it, and leaves the first place empty.
 */
export type ExampleDoc = {
    label: string
    node: () => RenderableElements
    code: string
}

/** A method callable on the component's instance */
export type MethodDoc = {
    name: string
    description: string
}

/** A named object type an attr refers to */
export type TypeDoc = {
    name: string
    /** One line on what the type is for, shown above its table */
    description?: string
    /** Its fields - the same shape as an attribute row, so the tables read identically */
    fields: AttrDoc[]
}

export type ComponentDoc = {
    name: string
    /** Which category this belongs to. A chart's folder under `src/` is the same fact, in lower case */
    group: string
    /** URL-safe id, e.g. "line-chart" for "LineChart" */
    slug: string
    /** One-sentence summary shown at the top of the chart's page */
    description: string
    kind: "component" | "function"
    signature?: string
    attrs: AttrDoc[]
    methods?: MethodDoc[]
    types?: TypeDoc[]
    themeOptions?: TypeDoc[]
    children?: string
    examples: ExampleDoc[]
}

const chartGroups: Record<string, string> = {
    LineChart: "Cartesian",
    AreaChart: "Cartesian",
    BarChart: "Cartesian",
    MixedChart: "Cartesian",
    ScatterChart: "Cartesian",
    BubbleChart: "Cartesian",
    HistogramChart: "Cartesian",
    WaterfallChart: "Cartesian",
    BoxPlotChart: "Cartesian",
    CandlestickChart: "Cartesian",
    PieChart: "Radial",
    Gauge: "Radial",
    RadarChart: "Radial",
    PolarAreaChart: "Radial",
    Heatmap: "Matrix",
    CalendarHeatmap: "Matrix",
    Treemap: "Hierarchy",
    SunburstChart: "Hierarchy",
    FunnelChart: "Flow",
    SankeyChart: "Flow",
    Sparkline: "Inline",
}

const descriptions: Record<string, string> = {
    MixedChart: "Different kinds of series on one set of axes, such as bars with a line over them, with a second y axis for a measure in other units.",
    ScatterChart: "Points placed by two values, for how one thing varies with another. A pointer reads the one point nearest it.",
    BubbleChart: "A scatter chart whose points also show a third value by their size. Area follows the value, since area is what the eye reads.",
    HistogramChart: "How raw values are distributed: counted into bins, with the bars touching since the bins do.",
    WaterfallChart: "How a start becomes an end through gains and losses, each step hanging from where the last finished.",
    BoxPlotChart: "How several groups' values are spread: the middle half, the median, the whiskers and any outliers. Give it raw values or a summary.",
    CandlestickChart: "How a price moved over each period: its range, and where it opened and closed. Candle or OHLC.",
    RadarChart: "Several measures of one thing around a circle, so two things can be compared by their shape.",
    PolarAreaChart: "A pie whose slices are equal in angle and differ in how far they reach, for values that are not parts of one whole.",
    Heatmap: "Values in a grid of two categories, read by color, with a scale saying what the colors mean.",
    CalendarHeatmap: "Daily values as a grid of weeks. Month and day names come from the browser's language.",
    Treemap: "Nested parts of a whole, each sized by area. Squarified, so rectangles stay readable rather than turning into slivers.",
    SunburstChart: "Nested parts of a whole as rings, for when the levels matter as much as the sizes.",
    FunnelChart: "How much of a group makes it through each stage, each stage's width being its value.",
    SankeyChart: "Flows between stages, each band's thickness being how much moved. Columns follow the longest route to a node.",
    LineChart: "A line chart for trends over time, optionally filled and optionally stacked. Hovering anywhere over the plot reads out every series at the nearest category.",
    AreaChart: "A filled line chart - LineChart with area set. Stack it to show how parts add up to a total.",
    BarChart: "A bar chart for comparing categories: vertical or horizontal, with series side by side or stacked.",
    PieChart: "A pie or donut chart for part-to-whole. Slices are drawn in the order given, never re-sorted, so they stay aligned with a legend or table beside them.",
    Gauge: "A radial gauge for one value against a range, with optional coloured bands for good/warning/critical zones.",
    Sparkline: "A tiny axis-less trend, sized to sit inside a table cell or beside a number. Line, area or bar.",
}

const typeDefinitions: Record<string, TypeDoc> = {
    ChartAxisType: {
        name: "ChartAxisType",
        description: "One axis of a chart with x and y axes.",
        fields: [
            {name: "type", type: '"category" | "linear" | "log" | "time"', description: "What it measures. An x axis follows its points' x when unset, and a value axis is linear."},
            {name: "title", type: "string", description: "A title drawn along the axis."},
            {name: "min", type: "number", description: "Fixes the low end, rather than following the data."},
            {name: "max", type: "number", description: "Fixes the high end, rather than following the data."},
            {name: "format", type: "(value: number) => string", description: "Formats ticks and tooltip values read against this axis."},
            {name: "tickCount", type: "number", description: "About how many ticks to draw."},
            {name: "reverse", type: "boolean", defaultValue: "false", description: "Runs the axis the other way."},
            {name: "hideGrid", type: "boolean", defaultValue: "false", description: "Leaves out the grid lines."},
            {name: "utc", type: "boolean", defaultValue: "false", description: "Reads a time axis in UTC rather than the browser's zone."},
        ],
    },
    ChartAnnotationType: {
        name: "ChartAnnotationType",
        description: "Something drawn to mark a value or a range. An annotation's value widens the axis if it has to, since one out of view means nothing.",
        fields: [
            {name: "type", type: '"line" | "band" | "point"', required: true, description: "A line across the plot, a shaded range, or a labelled point."},
            {name: "axis", type: '"x" | "y" | "y2"', defaultValue: "y", description: "Which axis a line or band is on."},
            {name: "value", type: "number | Date | string", description: "A line's position. On a category axis, a label or an index."},
            {name: "from, to", type: "number | Date | string", description: "A band's ends."},
            {name: "x, y", type: "number | Date | string, number", description: "A point's position."},
            {name: "label", type: "string", description: "Written beside it."},
            {name: "color", type: "string", defaultValue: "a quiet grey", description: "A CSS color. Use var(...), so it follows the theme."},
            {name: "dashed", type: "boolean", defaultValue: "false", description: "Draws a line dashed."},
        ],
    },
    TreeNodeType: {
        name: "TreeNodeType",
        description: "A leaf with a value, or a group with children.",
        fields: [
            {name: "label", type: "string", required: true, description: "Its name."},
            {name: "value", type: "number", description: "A leaf's size. A group's is the sum of its children."},
            {name: "children", type: "TreeNodeType[]", description: "What is inside it."},
            {name: "color", type: "string", defaultValue: "its top-level palette slot", description: "A CSS color for it and everything under it."},
        ],
    },
    ChartPointType: {
        name: "ChartPointType",
        description: "One category on a chart's axis, with a value per series.",
        fields: [
            {name: "label", type: "string", description: "The name drawn on a category axis and shown in the tooltip. A numeric or time x formats itself when this is unset."},
            {name: "x", type: "number | Date", description: "Where this point sits on a numeric or time axis. Unset, the axis is categories in the order given."},
            {name: "errors", type: "Record<string, number | [number, number]>", description: "Uncertainty per series, drawn as an error bar: one number for either side, or [below, above]."},
            {name: "values", type: "Record<string, number | undefined>", required: true, description: "One entry per series, keyed by that series' key. A missing or undefined value is a gap: a line breaks at it, a bar is absent, and the tooltip skips it. spanGaps joins a line across one."},
        ],
    },
    ChartSeriesType: {
        name: "ChartSeriesType",
        description: "One series plotted across every category.",
        fields: [
            {name: "key", type: "string", required: true, description: "Matches the key used in each point's values."},
            {name: "label", type: "string", defaultValue: "the key", description: "Name shown in the legend and tooltip."},
            {name: "color", type: "string", defaultValue: "its slot in ChartThemeOptions.seriesColors", description: "Overrides the palette for this series. Prefer the palette - a literal looks right in one theme and wrong in the other."},
            {name: "type", type: '"line" | "area" | "bar" | "scatter" | "none"', defaultValue: "what the chart draws", description: "How this series is drawn. \"none\" isn't drawn, and still reads in the tooltip and the hidden table."},
            {name: "yAxis", type: '"left" | "right"', defaultValue: "left", description: "Which y axis it reads against."},
            {name: "curve", type: '"linear" | "smooth" | "step" | "step-before" | "step-after"', defaultValue: "linear", description: "How a line joins its points. Smooth never overshoots a value."},
            {name: "dashed", type: "boolean", defaultValue: "false", description: "Draws its line dashed."},
            {name: "hidden", type: "boolean", defaultValue: "false", description: "Starts hidden, for a reader to turn on from the legend."},
            {name: "trendline", type: '"linear" | {type: "moving-average", window: number}', description: "Draws a trend through it."},
            {name: "showValues", type: "boolean", defaultValue: "false", description: "Writes its values beside its marks."},
        ],
    },
    PieSliceType: {
        name: "PieSliceType",
        description: "One slice of a PieChart.",
        fields: [
            {name: "label", type: "string", required: true, description: "The slice's name."},
            {name: "value", type: "number", required: true, description: "Its size, as a share of the total of every slice."},
            {name: "color", type: "string", defaultValue: "its slot in ChartThemeOptions.seriesColors", description: "Overrides the palette for this slice."},
        ],
    },
    GaugeBandType: {
        name: "GaugeBandType",
        description: "A tinted range on a Gauge's track.",
        fields: [
            {name: "from", type: "number", required: true, description: "Where the band starts, in the gauge's own units."},
            {name: "to", type: "number", required: true, description: "Where it ends."},
            {name: "color", type: "string", required: true, description: "The band's colour."},
        ],
    },
}

const componentTypes: Record<string, string[]> = {
    LineChart: ["ChartPointType", "ChartSeriesType", "ChartAxisType", "ChartAnnotationType"],
    AreaChart: ["ChartPointType", "ChartSeriesType", "ChartAxisType", "ChartAnnotationType"],
    BarChart: ["ChartPointType", "ChartSeriesType", "ChartAxisType", "ChartAnnotationType"],
    MixedChart: ["ChartPointType", "ChartSeriesType", "ChartAxisType", "ChartAnnotationType"],
    PieChart: ["PieSliceType"],
    PolarAreaChart: ["PieSliceType"],
    FunnelChart: ["PieSliceType"],
    RadarChart: ["ChartPointType", "ChartSeriesType"],
    Gauge: ["GaugeBandType"],
    Treemap: ["TreeNodeType"],
    SunburstChart: ["TreeNodeType"],
    ScatterChart: ["ChartAxisType", "ChartAnnotationType"],
    BubbleChart: ["ChartAxisType", "ChartAnnotationType"],
}

const chartThemeOptions: TypeDoc = {
    name: "ChartThemeOptions",
    description: "Shared by every chart, which is what keeps a dashboard's series colours consistent.",
    fields: [
        {name: "seriesColors", type: "string[]", defaultValue: "eight slots built from the theme's four hues at two lightness steps", description: "The palette each series is drawn from, in order. Never a hex literal in a chart itself - a literal looks right in one theme and wrong in the other."},
        {name: "emptySymbol", type: "FunctionComponent<EmptyAttrs>", defaultValue: "the U+2205 glyph", description: "Shown when a chart has nothing to draw. The glyph alone, with no sizing of its own."},
        {name: "patterns", type: "boolean", defaultValue: "false", description: "Every chart fills with patterns as well as color, unless its own patterns attr says otherwise."},
    ],
}

/** Attrs every chart with a frame takes */
const frameAttrs: AttrDoc[] = [
    {name: "title", type: "string", description: "A heading shown above the drawing. Also becomes the accessible name when ariaLabel is not set, so a visible title and a spoken one cannot disagree. Rendered as a div, not a heading element - the chart cannot know what level it sits at."},
    {name: "height", type: "number", defaultValue: "220", description: "Drawing height in px, excluding the legend. Width follows the container."},
    {name: "formatValue", type: "(n: number) => string", defaultValue: "String", description: "Formats ticks, tooltips and the hidden table, so what is read aloud matches what is drawn."},
    {name: "ariaLabel", type: "string", description: "Accessible name, used as the caption of the visually-hidden data table a screen reader reads in place of the drawing."},
    {name: "emptyMessage", type: "string", defaultValue: "ChartThemeOptions.emptySymbol", description: "Shown when there is nothing to draw."},
    {name: "hideLegend", type: "boolean", defaultValue: "false", description: "Hides the legend."},
    {name: "legendToggle", type: "boolean", defaultValue: "true", description: "Lets a reader hide and show entries by clicking the legend."},
    {name: "animate", type: "boolean", defaultValue: "true", description: "Animates the first drawing and changes of data, unless the reader asked for reduced motion."},
    {name: "onPointClick", type: "(detail: ChartPointDetail) => void", description: "Called when a reader activates a point, slice, cell or node, by click or with Enter."},
    {name: "patterns", type: "boolean", defaultValue: "ChartThemeOptions.patterns", description: "Fills series with patterns and dashes as well as color, for readers who can't tell the hues apart."},
    {name: "keyboard", type: "boolean", defaultValue: "true", description: "Lets a keyboard reader walk the marks with the arrow keys, each one read aloud."},
]

/** Attrs every chart on the cartesian engine takes */
const axesAttrs: AttrDoc[] = [
    {name: "xAxis", type: "ChartAxisType", description: "The x axis. Its type follows the points' x when unset."},
    {name: "yAxis", type: "ChartAxisType", description: "The left value axis."},
    {name: "yAxisRight", type: "ChartAxisType", description: "The right value axis, which series with yAxis: \"right\" read against."},
    {name: "beginAtZero", type: "boolean", defaultValue: "true", description: "Starts the value axis at zero rather than at the data's own minimum."},
    {name: "hover", type: '"index" | "mark" | "nearest" | "none"', defaultValue: "depends on the chart", description: "What a pointer reads: every series at the nearest x, the mark under it, or the one closest point."},
    {name: "annotations", type: "ChartAnnotationType[]", description: "Lines, bands and labelled points drawn on the plot."},
    {name: "crosshair", type: "boolean", defaultValue: "false", description: "Follows the pointer with lines to the axes and reads their values off there."},
    {name: "syncGroup", type: "string", description: "Charts sharing this name move their cursors together and zoom together."},
    {name: "zoom", type: '"x" | "y" | "xy"', description: "Lets a reader zoom and pan. Drag pans, ctrl or cmd and the wheel zooms, a pinch zooms, a double click resets, and the keyboard has + - 0."},
    {name: "wheelZoom", type: '"modifier" | "always"', defaultValue: "modifier", description: "Whether the wheel needs ctrl or cmd. \"always\" takes every scroll over the chart, which traps a reader scrolling down the page."},
    {name: "onZoom", type: "(view: ChartViewType | undefined) => void", description: "Called whenever the view changes."},
    {name: "brush", type: 'true | "x" | "xy"', description: "Dragging selects a range, or a rectangle with \"xy\". With zoom set, shift and drag pans."},
    {name: "onBrush", type: "(selection) => void", description: "Called when a brush is released, with the range and the points in it."},
    {name: "brushZoom", type: "boolean", defaultValue: "true when zoom is set", description: "Zooms to a range when it is brushed."},
    {name: "rangeSlider", type: "boolean", defaultValue: "false", description: "Draws an overview under the plot with a window a reader can drag and resize."},
    {name: "renderer", type: '"svg" | "canvas"', defaultValue: "svg", description: "Canvas paints marks instead of making elements, for tens of thousands of them. Axes and interaction stay as they are."},
    {name: "maxTableRows", type: "number", defaultValue: "1000", description: "The most rows the hidden table holds, sampled evenly. Export reads every row."},
]

/** Attrs of the charts taking data and series */
const seriesAttrs: AttrDoc[] = [
    {name: "data", type: "ChartPointType[]", required: true, description: "One entry per position along the x axis: {label, x?, values: {seriesKey: number}}."},
    {name: "series", type: "ChartSeriesType[]", required: true, description: "The series to plot: {key, label?, color?, type?, ...}. Their order picks their palette slots."},
    {name: "stacked", type: "boolean", defaultValue: "false", description: "Stacks series on top of each other rather than overlaying them. Negatives build downward from zero."},
    {name: "showValues", type: "boolean", defaultValue: "false", description: "Writes each value beside its mark, thinned when there isn't room."},
]

/** Attrs of the charts drawing lines */
const lineAttrs: AttrDoc[] = [
    {name: "showDots", type: "boolean", defaultValue: "true below 40 points", description: "A dot at each point."},
    {name: "spanGaps", type: "boolean", defaultValue: "false", description: "Joins a line across a missing value rather than leaving a gap."},
    {name: "downsample", type: 'false | {algorithm?: "lttb" | "min-max", threshold?: number}', defaultValue: "lttb, at twice the plot's width", description: "Thins a long line to what its pixels can show. min-max keeps every spike. The tooltip still reads every point."},
]

const attrTables: Record<string, AttrDoc[]> = {
    LineChart: [...seriesAttrs, ...lineAttrs, {name: "area", type: "boolean", defaultValue: "false", description: "Fills under each line. AreaChart is this component with it set."}, ...axesAttrs, ...frameAttrs],
    AreaChart: [...seriesAttrs, ...lineAttrs, ...axesAttrs, ...frameAttrs],
    BarChart: [...seriesAttrs, {name: "horizontal", type: "boolean", defaultValue: "false", description: "Bars run left-to-right. Worth reaching for whenever the category labels are words rather than dates. Not with zoom or brush."}, ...axesAttrs, ...frameAttrs],
    MixedChart: [...seriesAttrs, ...lineAttrs, ...axesAttrs, ...frameAttrs],
    ScatterChart: [{name: "series", type: "ScatterSeriesType[]", required: true, description: "Each series has its own points: {key, label?, color?, points: [{x, y, label?}]}, and need not share x values with another."}, ...axesAttrs, ...frameAttrs],
    BubbleChart: [{name: "series", type: "ScatterSeriesType[]", required: true, description: "As ScatterChart, with a size on each point, which its area follows."}, {name: "maxRadius", type: "number", defaultValue: "24", description: "The radius in px of the largest bubble."}, ...axesAttrs, ...frameAttrs],
    HistogramChart: [
        {name: "values", type: "number[]", required: true, description: "The raw values to count."},
        {name: "bins", type: "number | number[]", defaultValue: "Sturges' rule", description: "About how many bins, or the exact edges between them, ascending. A value on an edge goes to the bin it starts."},
        {name: "countLabel", type: "string", description: "Names the count in the tooltip and the hidden table."},
        {name: "color", type: "string", defaultValue: "the first series color", description: "A CSS color for the bars."},
        ...axesAttrs, ...frameAttrs,
    ],
    WaterfallChart: [
        {name: "data", type: "WaterfallStepType[]", required: true, description: "The steps: {label, value, total?}. A total draws the running total from zero."},
        {name: "increaseColor", type: "string", defaultValue: "var(--secondary)", description: "A CSS color for steps up."},
        {name: "decreaseColor", type: "string", defaultValue: "var(--accent)", description: "A CSS color for steps down."},
        {name: "totalColor", type: "string", defaultValue: "var(--primary)", description: "A CSS color for totals."},
        ...axesAttrs.filter(attr => attr.name !== "xAxis"), ...frameAttrs,
    ],
    BoxPlotChart: [
        {name: "data", type: "BoxPlotEntryType[]", required: true, description: "One box each: {label, color?, values} to summarize, or {label, color?, summary} worked out already."},
        {name: "labels", type: "BoxPlotLabelsType", defaultValue: "symbols", description: "Names for the five numbers in the tooltip and the hidden table. The defaults are symbols, because the package assumes no language."},
        ...axesAttrs.filter(attr => attr.name !== "xAxis"), ...frameAttrs,
    ],
    CandlestickChart: [
        {name: "data", type: "CandlestickPointType[]", required: true, description: "One period each: {x?, label?, open, high, low, close}."},
        {name: "variant", type: '"candle" | "ohlc"', defaultValue: "candle", description: "Fills a body between open and close, or draws ticks on one line."},
        {name: "upColor", type: "string", defaultValue: "var(--secondary)", description: "A CSS color for a period closing higher."},
        {name: "downColor", type: "string", defaultValue: "var(--accent)", description: "A CSS color for a period closing lower."},
        {name: "labels", type: "{open, high, low, close}", defaultValue: "O, H, L, C", description: "What the four numbers are called."},
        ...axesAttrs, ...frameAttrs,
    ],
    PieChart: [
        {name: "data", type: "PieSliceType[]", required: true, description: "The slices: {label, value, color?}, drawn from 12 o'clock in the order given."},
        {name: "donut", type: "number", defaultValue: "0", description: "Hole size as a fraction of the radius, 0-0.9. 0.6 is the usual donut."},
        {name: "centerLabel", type: "string", description: "Content for the middle of a donut."},
        {name: "centerSubLabel", type: "string", description: "Smaller text under centerLabel."},
        {name: "showPercent", type: "boolean", defaultValue: "true", description: "Shows each slice's share in the tooltip."},
        {name: "showValues", type: "boolean", defaultValue: "false", description: "Writes each slice's share on it, leaving out slices too thin to hold it."},
        {name: "valueLabel", type: "string", description: "Header of the value column in the hidden table a screen reader reads. No default, because the package assumes no language."},
        {name: "shareLabel", type: "string", description: "Header of the share-of-total column in that table. No default, for the same reason."},
        ...frameAttrs,
    ],
    Gauge: [
        {name: "value", type: "number", required: true, description: "The value to show."},
        {name: "min", type: "number", defaultValue: "0", description: "The low end of the range."},
        {name: "max", type: "number", defaultValue: "100", description: "The high end of the range."},
        {name: "sweep", type: "number", defaultValue: "240", description: "How much of a circle the track spans, in degrees."},
        {name: "bands", type: "GaugeBandType[]", description: "Ranges to tint: {from, to, color}. The value arc is inset, so they stay visible."},
        {name: "color", type: "string", defaultValue: "var(--primary)", description: "The value arc's color when no band applies."},
        {name: "label", type: "string", defaultValue: "the formatted value", description: "Text in the centre."},
        {name: "subLabel", type: "string", description: "Smaller text under the centre label."},
        {name: "showRange", type: "boolean", defaultValue: "true", description: "Draws min and max at the ends of the track."},
        ...frameAttrs,
    ],
    RadarChart: [
        {name: "data", type: "ChartPointType[]", required: true, description: "One entry per spoke, clockwise from 12 o'clock. At least three, each with a label."},
        {name: "series", type: "ChartSeriesType[]", required: true, description: "The series to plot."},
        {name: "fill", type: "boolean", defaultValue: "true", description: "Fills each shape."},
        {name: "max", type: "number", description: "Fixes the outer ring's value."},
        ...frameAttrs,
    ],
    PolarAreaChart: [
        {name: "data", type: "PieSliceType[]", required: true, description: "The slices, clockwise from 12 o'clock."},
        {name: "valueLabel", type: "string", description: "Header of the value column in the hidden table. No default."},
        ...frameAttrs,
    ],
    Heatmap: [
        {name: "columns", type: "string[]", required: true, description: "Column names, left to right."},
        {name: "rows", type: "string[]", required: true, description: "Row names, top to bottom."},
        {name: "values", type: "(number | undefined)[][]", required: true, description: "values[row][column]. A missing value is an empty cell."},
        {name: "color", type: "string", defaultValue: "var(--primary)", description: "The color of the highest value."},
        {name: "diverging", type: "boolean", defaultValue: "false", description: "Runs from negativeColor through the background to color, around zero."},
        {name: "negativeColor", type: "string", defaultValue: "var(--accent)", description: "The color of the lowest value when diverging."},
        {name: "showValues", type: "boolean", defaultValue: "false", description: "Writes each value in its cell."},
        ...frameAttrs,
    ],
    CalendarHeatmap: [
        {name: "data", type: "CalendarDayType[]", required: true, description: "The days: {date, value}. A date is read in UTC, so it means the same day wherever the page is opened."},
        {name: "from", type: "Date | string", defaultValue: "the earliest in data", description: "The first day to show."},
        {name: "to", type: "Date | string", defaultValue: "the latest in data", description: "The last day to show."},
        {name: "weekStart", type: "number", defaultValue: "0", description: "The day a week starts on. 0 is Sunday."},
        {name: "color", type: "string", defaultValue: "var(--primary)", description: "The color of the highest value."},
        ...frameAttrs,
    ],
    Treemap: [{name: "data", type: "TreeNodeType[]", required: true, description: "The top-level nodes, which set the colors and are in the legend."}, ...frameAttrs],
    SunburstChart: [
        {name: "data", type: "TreeNodeType[]", required: true, description: "The top-level nodes, which make the innermost ring."},
        {name: "hole", type: "number", defaultValue: "0.2", description: "Size of the hole in the middle, as a fraction of the radius."},
        ...frameAttrs,
    ],
    FunnelChart: [
        {name: "data", type: "PieSliceType[]", required: true, description: "The stages, first to last. Their order is kept, since a funnel's order is its meaning."},
        {name: "showPercent", type: "boolean", defaultValue: "true", description: "Shows each stage's share of the first."},
        {name: "valueLabel", type: "string", description: "Header of the value column in the hidden table. No default."},
        {name: "shareLabel", type: "string", description: "Header of the share column in that table. No default."},
        ...frameAttrs,
    ],
    SankeyChart: [
        {name: "nodes", type: "SankeyNodeType[]", required: true, description: "The nodes: {id, label?, color?}."},
        {name: "links", type: "SankeyLinkType[]", required: true, description: "The flows: {source, target, value}. One that would close a loop is left out, since a flow diagram runs one way."},
        {name: "nodeWidth", type: "number", defaultValue: "14", description: "The thickness of a node in px."},
        {name: "nodePadding", type: "number", defaultValue: "10", description: "The gap between nodes in a column, in px."},
        {name: "tableLabels", type: "{source, target, value}", description: "Column headers of the hidden table. No default."},
        ...frameAttrs,
    ],
    Sparkline: [
        {name: "values", type: "number[]", required: true, description: "The values, oldest first."},
        {name: "variant", type: '"line" | "area" | "bar"', defaultValue: "line", description: "How to draw them."},
        {name: "width", type: "number", defaultValue: "120", description: "Fixed width in px. A sparkline does not resize with its container - it is a glyph, not a chart."},
        {name: "height", type: "number", defaultValue: "28", description: "Fixed height in px."},
        {name: "color", type: "string", defaultValue: "var(--primary)", description: "CSS colour for the stroke or fill."},
        {name: "showLast", type: "boolean", defaultValue: "true for line/area", description: "A dot on the most recent value."},
        {name: "ariaLabel", type: "string", description: "Accessible name. Unset, the sparkline is aria-hidden, which is right when the number it illustrates is already in the text beside it."},
    ],
}

const monthlyRevenue = [
    {label: "Jan", values: {revenue: 12, costs: 8}},
    {label: "Feb", values: {revenue: 19, costs: 11}},
    {label: "Mar", values: {revenue: 15, costs: 10}},
    {label: "Apr", values: {revenue: 27, costs: 15}},
    {label: "May", values: {revenue: 22, costs: 13}},
]
const revenueSeries = [{key: "revenue", label: "Revenue"}, {key: "costs", label: "Costs"}]
const quarterlyChannels = [
    {label: "Q1", values: {direct: 31, partner: 18, organic: 24, paid: 12}},
    {label: "Q2", values: {direct: 38, partner: 22, organic: 21, paid: 17}},
    {label: "Q3", values: {direct: 34, partner: 29, organic: 27, paid: 14}},
    {label: "Q4", values: {direct: 45, partner: 26, organic: 33, paid: 21}},
]
const channelSeries = [
    {key: "direct", label: "Direct"}, {key: "partner", label: "Partner"},
    {key: "organic", label: "Organic"}, {key: "paid", label: "Paid"},
]
const spendByTeam = [
    {label: "Platform", value: 24}, {label: "Growth", value: 18},
    {label: "Infra", value: 12}, {label: "Design", value: 7},
]
const weeklySignups = [4, 7, 5, 11, 9, 14, 12, 18, 15, 21]
const frameMethods: MethodDoc[] = [
    {name: "update(attrs)", description: "Changes some attrs and redraws, keeping the element and what the reader has hidden. Values move to their new positions when the shape of the data is the same. Reach it through getComponent."},
    {name: "toCsv()", description: "The chart's values as CSV, as their formats write them. Every row, whatever maxTableRows says. A cell that would run as a formula in a spreadsheet is defused."},
    {name: "toSvgString()", description: "A stand-alone copy of the drawing, with its title and legend and every style written in."},
    {name: "toPngBlob(scale?)", description: "The drawing as a PNG, on the page's background color."},
    {name: "download(format, filename)", description: "Saves the chart through the browser as \"csv\", \"svg\" or \"png\"."},
]

const axesMethods: MethodDoc[] = [
    {name: "appendData(points, options?)", description: "Adds points for a live feed, dropping older ones past maxPoints. A burst costs one redraw, and a view at the live edge moves along with it."},
    {name: "zoomTo(view)", description: "Zooms to {xMin, xMax, yMin?, yMax?}, in axis units: milliseconds on a time axis, the index on a category axis."},
    {name: "resetZoom()", description: "Back to showing everything."},
    {name: "getView()", description: "The range in view, or undefined when showing everything."},
]

const row = {display: "flex", gap: "0.75em", flexWrap: "wrap", alignItems: "center"} as const

const dailyValues = Array.from({length: 120}, (_, i) => ({
    x: new Date(Date.UTC(2026, 0, 1 + i)),
    values: {visits: Math.round(400 + Math.sin(i / 8) * 150 + (i % 7) * 12)},
}))
const manyPoints = Array.from({length: 50_000}, (_, i) => ({x: i, values: {value: Math.sin(i / 400) * 10 + Math.sin(i / 37) * 2}}))
const orgTree = [
    {label: "Engineering", children: [{label: "Platform", value: 40}, {label: "Apps", value: 30}, {label: "Data", value: 18}]},
    {label: "Sales", children: [{label: "Direct", value: 20}, {label: "Partners", value: 12}]},
    {label: "Support", value: 14},
]
const prices = Array.from({length: 24}, (_, i) => {
    const open = 100 + Math.sin(i / 3) * 12 + i
    const close = open + Math.cos(i * 1.7) * 6
    return {x: new Date(Date.UTC(2026, 0, 5 + i)), open, close, high: Math.max(open, close) + 3, low: Math.min(open, close) - 3}
})

const examplesByName: Record<string, ExampleDoc[]> = {
    LineChart: [
        {label: "Two series", node: () => <LineChart data={monthlyRevenue} series={revenueSeries} height={200} ariaLabel="Revenue and costs by month" formatValue={(n: number) => `$${n}k`}/>, code: `<LineChart
    data={monthlyRevenue}
    series={revenueSeries}
    height={200}
    ariaLabel="Revenue and costs by month"
    formatValue={(n) => \`$\${n}k\`}/>`},
        {label: "Titled, and four series", node: () => <LineChart title="Bookings by channel" data={quarterlyChannels} series={channelSeries} height={220} formatValue={(n: number) => `$${n}k`}/>, code: `// A title is also the accessible name when ariaLabel is not set, so the
// visible heading and the one a screen reader announces cannot drift apart
<LineChart
    title="Bookings by channel"
    data={quarterlyChannels}
    series={channelSeries}
    height={220}
    formatValue={(n) => \`$\${n}k\`}/>`},
        {label: "No dots, and no legend", node: () => <LineChart title="Revenue trend" data={monthlyRevenue} series={revenueSeries} showDots={false} hideLegend height={180} formatValue={(n: number) => `$${n}k`}/>, code: `// showDots off and the legend hidden: a single trend line reads as a shape
// rather than as a series of readings
<LineChart
    title="Revenue trend"
    data={monthlyRevenue}
    series={revenueSeries}
    showDots={false}
    hideLegend
    height={180}
    formatValue={(n) => \`$\${n}k\`}/>`},
        {label: "A time axis, with a title on each axis", node: () => <LineChart height={220} data={dailyValues} series={[{key: "visits", label: "Visits"}]} xAxis={{type: "time", title: "Date"}} yAxis={{title: "Visits"}}/>, code: `<LineChart
    data={days.map(day => ({x: day.date, values: {visits: day.visits}}))}
    series={[{key: "visits", label: "Visits"}]}
    xAxis={{type: "time", title: "Date"}}
    yAxis={{title: "Visits"}}/>`},
        {label: "A log axis", node: () => <LineChart height={200} yAxis={{type: "log"}} series={[{key: "users", label: "Users"}]} data={[{label: "2021", values: {users: 12}}, {label: "2022", values: {users: 150}}, {label: "2023", values: {users: 1900}}, {label: "2024", values: {users: 21000}}]}/>, code: `<LineChart yAxis={{type: "log"}} data={yearly} series={[{key: "users"}]}/>`},
        {label: "A gap, and a stepped line", node: () => <LineChart height={200} series={[{key: "a", label: "Reported"}, {key: "b", label: "Limit", curve: "step-after"}]} data={[{label: "Mon", values: {a: 4, b: 8}}, {label: "Tue", values: {a: 6, b: 8}}, {label: "Wed", values: {b: 6}}, {label: "Thu", values: {a: 5, b: 6}}, {label: "Fri", values: {a: 7, b: 10}}]}/>, code: `// Wednesday has no "a", so its line breaks. spanGaps would join it.
<LineChart
    series={[{key: "a", label: "Reported"}, {key: "b", label: "Limit", curve: "step-after"}]}
    data={[{label: "Tue", values: {a: 6, b: 8}}, {label: "Wed", values: {b: 6}}, {label: "Thu", values: {a: 5, b: 6}}]}/>`},
        {label: "Zoom and pan", node: () => <LineChart height={220} zoom="x" data={dailyValues} series={[{key: "visits", label: "Visits"}]}/>, code: `// Drag pans, ctrl or cmd and the wheel zooms, a pinch zooms, and a double click goes back.
// With the chart focused, + and - zoom, shift and an arrow pans, and 0 goes back.
<LineChart zoom="x" data={days} series={series}/>`},
        {label: "A range slider", node: () => <LineChart height={260} rangeSlider data={dailyValues} series={[{key: "visits", label: "Visits"}]}/>, code: `<LineChart rangeSlider data={days} series={series}/>`},
        {label: "A brush", node: () => <LineChart height={220} brush zoom="x" data={dailyValues} series={[{key: "visits", label: "Visits"}]}/>, code: `// Dragging selects a range and zooms to it. onBrush gets the range and the points in it.
<LineChart brush zoom="x" onBrush={({xMin, xMax, points}) => select(points)} data={days} series={series}/>`},
        {label: "Annotations", node: () => <LineChart height={240} data={monthlyRevenue} series={revenueSeries} annotations={[
            {type: "line", value: 35, label: "Target", dashed: true, color: "var(--accent)"},
            {type: "band", axis: "x", from: "Feb", to: "Mar", label: "Sale"},
            {type: "point", x: "Apr", y: 27, label: "Peak"},
        ]}/>, code: `<LineChart data={monthlyRevenue} series={revenueSeries} annotations={[
    {type: "line", value: 35, label: "Target", dashed: true, color: "var(--accent)"},
    {type: "band", axis: "x", from: "Feb", to: "Mar", label: "Sale"},
    {type: "point", x: "Apr", y: 27, label: "Peak"},
]}/>`},
        {label: "Error bars and a trend", node: () => <LineChart height={220} series={[{key: "m", label: "Measured", trendline: "linear"}]} data={[1, 2, 3, 4, 5, 6].map(n => ({x: n, values: {m: n * 3 + (n % 2 ? 2 : -1)}, errors: {m: 1 + n / 3}}))}/>, code: `<LineChart
    series={[{key: "m", label: "Measured", trendline: "linear"}]}
    data={[{x: 1, values: {m: 5}, errors: {m: 1.3}}, {x: 2, values: {m: 5}, errors: {m: 1.6}}]}/>`},
        {label: "A crosshair, and values on the marks", node: () => <LineChart height={220} crosshair showValues data={monthlyRevenue} series={[{key: "revenue", label: "Revenue"}]}/>, code: `<LineChart crosshair showValues data={monthlyRevenue} series={[{key: "revenue"}]}/>`},
        {label: "Charts that move together", node: () => <div style={{width: "100%"}}>
            <LineChart height={130} syncGroup="showcase-sync" zoom="x" data={dailyValues} series={[{key: "visits", label: "Visits"}]}/>
            <BarChart height={130} hover="index" syncGroup="showcase-sync" zoom="x" data={dailyValues} series={[{key: "visits", label: "Visits", color: "var(--secondary)"}]}/>
        </div>, code: `// One name: their cursors move together, and they zoom together.
<LineChart syncGroup="traffic" zoom="x" data={days} series={series}/>
<BarChart syncGroup="traffic" zoom="x" data={days} series={series}/>`},
        {label: "50,000 points, thinned to what the pixels can show", node: () => <LineChart height={200} data={manyPoints} series={[{key: "value", label: "Value"}]}/>, code: `// Automatic above twice the plot's width. The tooltip still reads every point.
<LineChart data={manyPoints} series={series}/>
<LineChart data={manyPoints} series={series} downsample={{algorithm: "min-max"}}/>`},
        {label: "On a canvas", node: () => <LineChart height={200} renderer="canvas" zoom="x" data={manyPoints} series={[{key: "value", label: "Value"}]}/>, code: `// Marks painted instead of made into elements. Axes and interaction stay as they are.
<LineChart renderer="canvas" zoom="x" data={manyPoints} series={series}/>`},
        {label: "Patterns as well as color", node: () => <BarChart height={220} patterns data={quarterlyChannels} series={channelSeries}/>, code: `// Or ChartThemeOptions.patterns = true, for every chart
<BarChart patterns data={quarterlyChannels} series={channelSeries}/>`},
    ],
    AreaChart: [
        {label: "Stacked, so the parts add up", node: () => <AreaChart data={monthlyRevenue} series={revenueSeries} stacked height={200} ariaLabel="Revenue and costs by month, stacked" formatValue={(n: number) => `$${n}k`}/>, code: `// Stacking is what makes an area chart say "these parts add up to this total"
<AreaChart
    data={monthlyRevenue}
    series={revenueSeries}
    stacked
    height={200}
    ariaLabel="Revenue and costs by month, stacked"
    formatValue={(n) => \`$\${n}k\`}/>`},
        {label: "Four series stacked, with a title", node: () => <AreaChart title="Bookings by channel" data={quarterlyChannels} series={channelSeries} stacked height={220} formatValue={(n: number) => `$${n}k`}/>, code: `<AreaChart
    title="Bookings by channel"
    data={quarterlyChannels}
    series={channelSeries}
    stacked
    height={220}
    formatValue={(n) => \`$\${n}k\`}/>`},
    ],
    BarChart: [
        {label: "Grouped", node: () => <BarChart data={monthlyRevenue} series={revenueSeries} height={200} ariaLabel="Revenue and costs by month"/>, code: `<BarChart data={monthlyRevenue} series={revenueSeries} height={200}
    ariaLabel="Revenue and costs by month"/>`},
        {label: "Horizontal, for word labels", node: () => <BarChart data={monthlyRevenue} series={revenueSeries} horizontal height={200} ariaLabel="Revenue and costs by month, horizontal"/>, code: `// Each category label gets a full line instead of being rotated
<BarChart data={monthlyRevenue} series={revenueSeries} horizontal height={200}
    ariaLabel="Revenue and costs by month, horizontal"/>`},
        {label: "Grouped, four series, titled", node: () => <BarChart title="Bookings by channel" data={quarterlyChannels} series={channelSeries} height={220} formatValue={(n: number) => `$${n}k`}/>, code: `<BarChart
    title="Bookings by channel"
    data={quarterlyChannels}
    series={channelSeries}
    height={220}
    formatValue={(n) => \`$\${n}k\`}/>`},
    ],
    PieChart: [
        {label: "Slices", node: () => <PieChart data={spendByTeam} height={200} ariaLabel="Spend by team"/>, code: `<PieChart data={spendByTeam} height={200} ariaLabel="Spend by team"/>`},
        {label: "As a donut, with a centre label", node: () => <PieChart data={spendByTeam} donut={0.6} height={200} centerLabel="61" centerSubLabel="total" ariaLabel="Spend by team"/>, code: `<PieChart
    data={spendByTeam}
    donut={0.6}
    height={200}
    centerLabel="61"
    centerSubLabel="total"
    ariaLabel="Spend by team"/>`},
    ],
    Gauge: [
        {label: "One value against a range", node: () => <Gauge value={72} height={180} subLabel="of quota" ariaLabel="72 percent of quota"/>, code: `<Gauge value={72} height={180} subLabel="of quota" ariaLabel="72 percent of quota"/>`},
        {label: "With bands", node: () => <Gauge value={93} height={180} subLabel="disk used" formatValue={(n: number) => `${n}%`} ariaLabel="93 percent of disk used" bands={[
            {from: 0, to: 70, color: "var(--secondary)"},
            {from: 70, to: 90, color: "var(--warning)"},
            {from: 90, to: 100, color: "var(--accent)"},
        ]}/>, code: `<Gauge
    value={93}
    height={180}
    subLabel="disk used"
    formatValue={(n) => \`\${n}%\`}
    ariaLabel="93 percent of disk used"
    bands={[
        {from: 0, to: 70, color: "var(--secondary)"},
        {from: 70, to: 90, color: "var(--warning)"},
        {from: 90, to: 100, color: "var(--accent)"},
    ]}/>`},
    ],
    MixedChart: [
        {label: "Bars and a line, on two axes", node: () => <MixedChart height={240} data={monthlyRevenue} yAxis={{title: "Revenue"}} yAxisRight={{title: "Costs"}} series={[
            {key: "revenue", label: "Revenue", type: "bar"},
            {key: "costs", label: "Costs", type: "line", yAxis: "right", curve: "smooth"},
        ]}/>, code: `<MixedChart
    data={monthlyRevenue}
    yAxis={{title: "Revenue"}}
    yAxisRight={{title: "Costs"}}
    series={[
        {key: "revenue", label: "Revenue", type: "bar"},
        {key: "costs", label: "Costs", type: "line", yAxis: "right", curve: "smooth"},
    ]}/>`},
    ],
    ScatterChart: [
        {label: "Two series", node: () => <ScatterChart height={240} xAxis={{title: "Height"}} yAxis={{title: "Weight"}} series={[
            {key: "a", label: "Group A", points: [{x: 160, y: 58}, {x: 165, y: 62}, {x: 170, y: 66}, {x: 175, y: 71}, {x: 182, y: 80, label: "Tallest"}]},
            {key: "b", label: "Group B", points: [{x: 155, y: 52}, {x: 162, y: 55}, {x: 168, y: 60}, {x: 172, y: 63}]},
        ]}/>, code: `<ScatterChart
    xAxis={{title: "Height"}}
    yAxis={{title: "Weight"}}
    series={[
        {key: "a", label: "Group A", points: [{x: 160, y: 58}, {x: 182, y: 80, label: "Tallest"}]},
        {key: "b", label: "Group B", points: [{x: 155, y: 52}, {x: 172, y: 63}]},
    ]}/>`},
    ],
    BubbleChart: [
        {label: "Size is a third value", node: () => <BubbleChart height={240} series={[{key: "a", label: "Markets", points: [
            {x: 10, y: 40, size: 200, label: "North"}, {x: 25, y: 22, size: 80, label: "East"}, {x: 40, y: 55, size: 320, label: "South"}, {x: 55, y: 30, size: 40, label: "West"},
        ]}]}/>, code: `<BubbleChart series={[{key: "a", label: "Markets", points: [
    {x: 10, y: 40, size: 200, label: "North"},
    {x: 40, y: 55, size: 320, label: "South"},
]}]}/>`},
    ],
    HistogramChart: [
        {label: "Counted into bins", node: () => <HistogramChart height={220} countLabel="Count" values={Array.from({length: 400}, (_, i) => 50 + Math.sin(i * 12.9898) * 43758.5453 % 25 + Math.cos(i * 78.233) * 12)}/>, code: `<HistogramChart values={responseTimes} countLabel="Count"/>`},
    ],
    WaterfallChart: [
        {label: "From a start to an end", node: () => <WaterfallChart height={240} formatValue={(n: number) => `$${n}k`} data={[
            {label: "Opening", value: 120}, {label: "Sales", value: 80}, {label: "Refunds", value: -15}, {label: "Costs", value: -60}, {label: "Closing", value: 0, total: true},
        ]}/>, code: `<WaterfallChart data={[
    {label: "Opening", value: 120},
    {label: "Sales", value: 80},
    {label: "Refunds", value: -15},
    {label: "Costs", value: -60},
    {label: "Closing", value: 0, total: true},
]}/>`},
    ],
    BoxPlotChart: [
        {label: "Raw values, or a summary", node: () => <BoxPlotChart height={240} data={[
            {label: "Team A", values: [12, 15, 14, 18, 22, 25, 19, 17, 16, 55]},
            {label: "Team B", values: [20, 24, 28, 31, 26, 22, 29, 33, 27, 25]},
            {label: "Team C", summary: {min: 8, q1: 14, median: 19, q3: 26, max: 34}},
        ]}/>, code: `<BoxPlotChart data={[
    {label: "Team A", values: [12, 15, 14, 18, 22, 25, 19, 17, 16, 55]},
    {label: "Team C", summary: {min: 8, q1: 14, median: 19, q3: 26, max: 34}},
]}/>`},
    ],
    CandlestickChart: [
        {label: "Candles, on a time axis you can zoom", node: () => <CandlestickChart height={260} data={prices} zoom="x" formatValue={(n: number) => n.toFixed(1)}/>, code: `<CandlestickChart data={prices} zoom="x"/>`},
        {label: "OHLC", node: () => <CandlestickChart height={220} data={prices} variant="ohlc" formatValue={(n: number) => n.toFixed(1)}/>, code: `<CandlestickChart data={prices} variant="ohlc"/>`},
    ],
    RadarChart: [
        {label: "Two things by their shape", node: () => <RadarChart height={280} series={[{key: "a", label: "This year"}, {key: "b", label: "Last year"}]} data={[
            {label: "Speed", values: {a: 80, b: 60}}, {label: "Reach", values: {a: 55, b: 70}}, {label: "Quality", values: {a: 90, b: 75}}, {label: "Cost", values: {a: 40, b: 50}}, {label: "Support", values: {a: 70, b: 45}},
        ]}/>, code: `<RadarChart
    series={[{key: "a", label: "This year"}, {key: "b", label: "Last year"}]}
    data={[
        {label: "Speed", values: {a: 80, b: 60}},
        {label: "Reach", values: {a: 55, b: 70}},
        {label: "Quality", values: {a: 90, b: 75}},
    ]}/>`},
    ],
    PolarAreaChart: [
        {label: "Equal slices, different reach", node: () => <PolarAreaChart height={260} data={spendByTeam}/>, code: `<PolarAreaChart data={spendByTeam}/>`},
    ],
    Heatmap: [
        {label: "With values", node: () => <Heatmap height={220} showValues columns={["Mon", "Tue", "Wed", "Thu", "Fri"]} rows={["Morning", "Afternoon", "Evening"]} values={[[4, 8, 6, 12, 3], [9, 14, 11, 7, 5], [2, undefined, 3, 6, 8]]}/>, code: `<Heatmap
    showValues
    columns={["Mon", "Tue", "Wed", "Thu", "Fri"]}
    rows={["Morning", "Afternoon", "Evening"]}
    values={[[4, 8, 6, 12, 3], [9, 14, 11, 7, 5], [2, undefined, 3, 6, 8]]}/>`},
        {label: "Diverging around zero", node: () => <Heatmap height={160} diverging showValues columns={["Q1", "Q2", "Q3", "Q4"]} rows={["North", "South"]} values={[[-12, 4, 18, 7], [6, -3, -9, 14]]}/>, code: `<Heatmap diverging columns={quarters} rows={regions} values={changes}/>`},
    ],
    CalendarHeatmap: [
        {label: "Daily values", node: () => <CalendarHeatmap height={150} weekStart={1} data={dailyValues.map(day => ({date: day.x, value: day.values.visits}))}/>, code: `<CalendarHeatmap weekStart={1} data={days}/>`},
    ],
    Treemap: [
        {label: "Nested groups", node: () => <Treemap height={280} data={orgTree}/>, code: `<Treemap data={[
    {label: "Engineering", children: [{label: "Platform", value: 40}, {label: "Apps", value: 30}]},
    {label: "Sales", children: [{label: "Direct", value: 20}]},
    {label: "Support", value: 14},
]}/>`},
    ],
    SunburstChart: [
        {label: "The levels as rings", node: () => <SunburstChart height={300} data={orgTree}/>, code: `<SunburstChart data={orgTree}/>`},
    ],
    FunnelChart: [
        {label: "Stages", node: () => <FunnelChart height={240} data={[{label: "Visits", value: 1000}, {label: "Signups", value: 420}, {label: "Trials", value: 180}, {label: "Paid", value: 60}]}/>, code: `<FunnelChart data={[
    {label: "Visits", value: 1000},
    {label: "Signups", value: 420},
    {label: "Paid", value: 60},
]}/>`},
    ],
    SankeyChart: [
        {label: "Flows", node: () => <SankeyChart height={280}
            nodes={[{id: "web", label: "Web"}, {id: "mail", label: "Email"}, {id: "ads", label: "Ads"}, {id: "trial", label: "Trial"}, {id: "lost", label: "Left"}, {id: "paid", label: "Paid"}]}
            links={[{source: "web", target: "trial", value: 50}, {source: "mail", target: "trial", value: 30}, {source: "ads", target: "trial", value: 20}, {source: "ads", target: "lost", value: 15}, {source: "trial", target: "paid", value: 40}, {source: "trial", target: "lost", value: 60}]}/>, code: `<SankeyChart
    nodes={[{id: "web", label: "Web"}, {id: "trial", label: "Trial"}, {id: "paid", label: "Paid"}]}
    links={[
        {source: "web", target: "trial", value: 50},
        {source: "trial", target: "paid", value: 40},
    ]}/>`},
    ],
    Sparkline: [
        {label: "Inline in a sentence", node: () => <Stack inline gap="sm" align="center">
            <Text>Signups this quarter</Text>
            <Sparkline values={weeklySignups}/>
            <Text strong numeric>21</Text>
        </Stack>, code: `<Stack inline gap="sm" align="center">
    <Text>Signups this quarter</Text>
    <Sparkline values={weeklySignups}/>
    <Text strong numeric>21</Text>
</Stack>`},
        {label: "Every variant", node: () => <div style={row}>
            <Sparkline values={weeklySignups} variant="line"/>
            <Sparkline values={weeklySignups} variant="area"/>
            <Sparkline values={weeklySignups} variant="bar"/>
        </div>, code: `<Sparkline values={weeklySignups} variant="line"/>
<Sparkline values={weeklySignups} variant="area"/>
<Sparkline values={weeklySignups} variant="bar"/>`},
    ],
}

function slugify(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

export const componentDocs: ComponentDoc[] = Object.keys(chartGroups).map(name => ({
    name,
    group: chartGroups[name],
    slug: slugify(name),
    description: descriptions[name] ?? "",
    kind: "component",
    attrs: attrTables[name] ?? [],
    methods: name === "Sparkline" ? undefined : chartGroups[name] === "Cartesian" ? [...axesMethods, ...frameMethods] : frameMethods,
    types: (componentTypes[name] ?? []).map(type => typeDefinitions[type]),
    themeOptions: [chartThemeOptions],
    examples: examplesByName[name] ?? [],
}))

/** Display order for sidebar/nav groups */
export const groupOrder = ["Cartesian", "Radial", "Matrix", "Hierarchy", "Flow", "Inline"]

/** `componentDocs`, bucketed by group and ordered per `groupOrder` */
export function groupedDocs(): {group: string, docs: ComponentDoc[]}[] {
    return groupOrder
        .map(group => ({group, docs: componentDocs.filter(doc => doc.group == group)}))
        .filter(bucket => bucket.docs.length > 0)
}

/** Looks up a single chart's doc by its URL slug */
export function docBySlug(slug: string): ComponentDoc | undefined {
    return componentDocs.find(doc => doc.slug == slug)
}

/** Converts a group name to a URL-safe slug */
export function groupSlug(group: string): string {
    return group.toLowerCase().replace(/\s+/g, "-")
}

/** Looks up a single group's bucket by its URL slug */
export function groupByGroupSlug(slug: string): {group: string, docs: ComponentDoc[]} | undefined {
    return groupedDocs().find(bucket => groupSlug(bucket.group) == slug)
}
