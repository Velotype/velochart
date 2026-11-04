import type { RenderableElements } from "@velotype/velotype"

import { Stack, Text } from "@velotype/velodesign"
import { AreaChart, BarChart, Gauge, LineChart, PieChart, Sparkline } from "@velotype/velochart"

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
    PieChart: "Radial",
    Gauge: "Radial",
    Sparkline: "Inline",
}

const descriptions: Record<string, string> = {
    LineChart: "A line chart for trends over time, optionally filled and optionally stacked. Hovering anywhere over the plot reads out every series at the nearest category.",
    AreaChart: "A filled line chart - LineChart with area set. Stack it to show how parts add up to a total.",
    BarChart: "A bar chart for comparing categories: vertical or horizontal, with series side by side or stacked.",
    PieChart: "A pie or donut chart for part-to-whole. Slices are drawn in the order given, never re-sorted, so they stay aligned with a legend or table beside them.",
    Gauge: "A radial gauge for one value against a range, with optional coloured bands for good/warning/critical zones.",
    Sparkline: "A tiny axis-less trend, sized to sit inside a table cell or beside a number. Line, area or bar.",
}

const typeDefinitions: Record<string, TypeDoc> = {
    ChartPointType: {
        name: "ChartPointType",
        description: "One category on a chart's axis, with a value per series.",
        fields: [
            {name: "label", type: "string", required: true, description: "The category's name, drawn on the axis."},
            {name: "values", type: "Record<string, number | undefined>", required: true, description: "One entry per series, keyed by that series' key. A missing or undefined value is plotted as zero."},
        ],
    },
    ChartSeriesType: {
        name: "ChartSeriesType",
        description: "One series plotted across every category.",
        fields: [
            {name: "key", type: "string", required: true, description: "Matches the key used in each point's values."},
            {name: "label", type: "string", defaultValue: "the key", description: "Name shown in the legend and tooltip."},
            {name: "color", type: "string", defaultValue: "its slot in ChartThemeOptions.seriesColors", description: "Overrides the palette for this series. Prefer the palette - a literal looks right in one theme and wrong in the other."},
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
    LineChart: ["ChartPointType", "ChartSeriesType"],
    AreaChart: ["ChartPointType", "ChartSeriesType"],
    BarChart: ["ChartPointType", "ChartSeriesType"],
    PieChart: ["PieSliceType"],
    Gauge: ["GaugeBandType"],
}

const chartThemeOptions: TypeDoc = {
    name: "ChartThemeOptions",
    description: "Shared by every chart, which is what keeps a dashboard's series colours consistent.",
    fields: [
        {name: "seriesColors", type: "string[]", defaultValue: "eight slots built from the theme's four hues at two lightness steps", description: "The palette each series is drawn from, in order. Never a hex literal in a chart itself - a literal looks right in one theme and wrong in the other."},
        {name: "emptySymbol", type: "FunctionComponent<EmptyAttrs>", defaultValue: "the U+2205 glyph", description: "Shown when a chart has nothing to draw. The glyph alone, with no sizing of its own."},
    ],
}

const attrTables: Record<string, AttrDoc[]> = {
    LineChart: [
        {name: "title", type: "string", description: "A heading shown above the drawing. Also becomes the accessible name when ariaLabel is not set, so a visible title and a spoken one cannot disagree. Rendered as a div, not a heading element - the chart cannot know what level it sits at."},
        {name: "data", type: "ChartPointType[]", required: true, description: "One entry per category: {label, values: {seriesKey: number}}."},
        {name: "series", type: "ChartSeriesType[]", required: true, description: "The series to plot: {key, label?, color?}. Their order picks their palette slots."},
        {name: "area", type: "boolean", defaultValue: "false", description: "Fills under each line. AreaChart is this component with it set."},
        {name: "stacked", type: "boolean", defaultValue: "false", description: "Stacks series on top of each other rather than overlaying them."},
        {name: "showDots", type: "boolean", defaultValue: "true below 40 points", description: "A dot at each point."},
        {name: "beginAtZero", type: "boolean", defaultValue: "true", description: "Starts the value axis at zero rather than the data's own minimum."},
        {name: "height", type: "number", defaultValue: "220", description: "Drawing height in px, excluding the legend. Width always fills the container."},
        {name: "formatValue", type: "(n: number) => string", defaultValue: "String", description: "Formats axis ticks and tooltip values."},
        {name: "ariaLabel", type: "string", description: "Accessible name, used as the caption of the visually-hidden data table a screen reader reads in place of the drawing. The chart never sets an SVG <title>, so it triggers no native browser tooltip."},
        {name: "emptyMessage", type: "string", defaultValue: "ChartThemeOptions.emptySymbol, the U+2205 glyph", description: "Shown when there is nothing to draw."},
        {name: "hideLegend", type: "boolean", defaultValue: "false", description: "Hides the legend even with more than one series. A single series never gets one."},
    ],
    AreaChart: [
        {name: "title", type: "string", description: "A heading shown above the drawing. Also becomes the accessible name when ariaLabel is not set, so a visible title and a spoken one cannot disagree. Rendered as a div, not a heading element - the chart cannot know what level it sits at."},
        {name: "data", type: "ChartPointType[]", required: true, description: "One entry per category: {label, values: {seriesKey: number}}."},
        {name: "series", type: "ChartSeriesType[]", required: true, description: "The series to plot: {key, label?, color?}. Their order picks their palette slots."},
        {name: "stacked", type: "boolean", defaultValue: "false", description: "Stacks series on top of each other rather than overlaying them. This is the one to reach for: stacking is what makes an area chart say \"these parts add up to this total\" rather than \"these two filled shapes happen to overlap\"."},
        {name: "showDots", type: "boolean", defaultValue: "true below 40 points", description: "A dot at each point."},
        {name: "beginAtZero", type: "boolean", defaultValue: "true", description: "Starts the value axis at zero rather than the data's own minimum."},
        {name: "height", type: "number", defaultValue: "220", description: "Drawing height in px, excluding the legend. Width always fills the container."},
        {name: "formatValue", type: "(n: number) => string", defaultValue: "String", description: "Formats axis ticks and tooltip values."},
        {name: "ariaLabel", type: "string", description: "Accessible name, used as the caption of the visually-hidden data table a screen reader reads in place of the drawing. The chart never sets an SVG <title>, so it triggers no native browser tooltip."},
        {name: "emptyMessage", type: "string", defaultValue: "ChartThemeOptions.emptySymbol, the U+2205 glyph", description: "Shown when there is nothing to draw."},
        {name: "hideLegend", type: "boolean", defaultValue: "false", description: "Hides the legend even with more than one series. A single series never gets one."},
    ],
    BarChart: [
        {name: "title", type: "string", description: "A heading shown above the drawing. Also becomes the accessible name when ariaLabel is not set, so a visible title and a spoken one cannot disagree. Rendered as a div, not a heading element - the chart cannot know what level it sits at."},
        {name: "data", type: "ChartPointType[]", required: true, description: "One entry per category."},
        {name: "series", type: "ChartSeriesType[]", required: true, description: "The series to plot."},
        {name: "horizontal", type: "boolean", defaultValue: "false", description: "Bars run left-to-right. Worth reaching for when category labels are words rather than dates - each label gets a full line instead of being rotated."},
        {name: "stacked", type: "boolean", defaultValue: "false", description: "Stacks each category's series into one bar."},
        {name: "height", type: "number", defaultValue: "220", description: "Drawing height in px."},
    ],
    PieChart: [
        {name: "title", type: "string", description: "A heading shown above the drawing. Also becomes the accessible name when ariaLabel is not set, so a visible title and a spoken one cannot disagree. Rendered as a div, not a heading element - the chart cannot know what level it sits at."},
        {name: "data", type: "PieSliceType[]", required: true, description: "The slices: {label, value, color?}, drawn from 12 o'clock in the order given."},
        {name: "donut", type: "number", defaultValue: "0", description: "Hole size as a fraction of the radius, 0-0.9. 0.6 is the usual donut."},
        {name: "centerLabel", type: "string", description: "Content for the middle of a donut."},
        {name: "centerSubLabel", type: "string", description: "Smaller text under centerLabel."},
        {name: "showPercent", type: "boolean", defaultValue: "true", description: "Shows each slice's share in the tooltip."},
    ],
    Gauge: [
        {name: "title", type: "string", description: "A heading shown above the drawing. Also becomes the accessible name when ariaLabel is not set, so a visible title and a spoken one cannot disagree. Rendered as a div, not a heading element - the chart cannot know what level it sits at."},
        {name: "value", type: "number", required: true, description: "The value to show."},
        {name: "min", type: "number", defaultValue: "0", description: "The low end of the range the value is read against."},
        {name: "max", type: "number", defaultValue: "100", description: "The high end of the range the value is read against."},
        {name: "sweep", type: "number", defaultValue: "240", description: "How much of a circle the track spans, in degrees. 180 is a half-circle for a wide, short tile."},
        {name: "bands", type: "GaugeBandType[]", description: "Ranges to tint: {from, to, color}. The value arc is inset so the bands stay visible, and takes the colour of the band it lands in."},
        {name: "label", type: "string", defaultValue: "the formatted value", description: "Text shown in the centre of the dial."},
        {name: "subLabel", type: "string", description: "Smaller text under the centre label."},
        {name: "showRange", type: "boolean", defaultValue: "true", description: "Draws min and max at the ends of the track."},
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
const row = {display: "flex", gap: "0.75em", flexWrap: "wrap", alignItems: "center"} as const

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
    types: (componentTypes[name] ?? []).map(type => typeDefinitions[type]),
    themeOptions: [chartThemeOptions],
    examples: examplesByName[name] ?? [],
}))

/** Display order for sidebar/nav groups */
export const groupOrder = ["Cartesian", "Radial", "Inline"]

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
