# velochart

A chart library for [Velotype](https://jsr.io/@velotype/velotype) - Deno's TSX framework. Charts are
drawn in SVG at the container's real pixel width, so text stays the size it was meant to be whatever
the chart's width, and each chart with tabular values exposes them to screen readers as a
visually-hidden table. A `renderer="canvas"` option paints dense marks on a canvas instead, under the
same SVG axes.

[velodesign](https://jsr.io/@velotype/velodesign) keeps a few basic charts for the most common needs.
velochart is where chart types and features go beyond those.

**[Showcase](https://velotype.github.io/velochart/)** - every chart, live, with its attributes.

## Install

```
deno add jsr:@velotype/velochart
```

## Usage

```tsx
import { LineChart } from "@velotype/velochart"
import { Theme } from "@velotype/velodesign"
import { replaceElementWithRoot } from "@velotype/velotype"

Theme.injectStyles()

replaceElementWithRoot(
    <LineChart
        title="Revenue and costs"
        data={[
            {label: "Jan", values: {revenue: 12, costs: 8}},
            {label: "Feb", values: {revenue: 19, costs: 11}},
            {label: "Mar", values: {revenue: 15, costs: 10}},
        ]}
        series={[{key: "revenue", label: "Revenue"}, {key: "costs", label: "Costs"}]}
        formatValue={(n) => `$${n}k`}/>,
    document.getElementById("app")!,
)
```

## Theming

velochart depends on velotype alone, and takes its colours from CSS custom properties: `--text`,
`--background` and its `--background-1` to `--background-9` ramp, and `--primary`, `--secondary`,
`--accent`, `--warning` with their `-7` steps. velodesign's `Theme.injectStyles()` defines all of
them, so a page using velodesign needs nothing more. A page without velodesign has to define those
properties itself, or the charts draw without their colours.

`ChartThemeOptions.seriesColors` reskins every chart's palette at once, and `ChartThemeOptions.patterns`
turns on patterns for all of them.

## Charts

**Cartesian** - LineChart, AreaChart, BarChart, MixedChart, ScatterChart, BubbleChart, HistogramChart,
WaterfallChart, BoxPlotChart, CandlestickChart

**Radial** - PieChart, Gauge, RadarChart, PolarAreaChart

**Matrix** - Heatmap, CalendarHeatmap

**Hierarchy** - Treemap, SunburstChart

**Flow** - FunnelChart, SankeyChart

**Inline** - Sparkline

## What they can do

Every chart with x and y axes runs on one engine, so all of this works on all of them:

- **Axes** - category, linear, log and time, with titles, fixed ranges, a second y axis, and gaps for
  missing values
- **Series** - lines, areas, bars and points mixed freely, stacked, stepped or smooth
- **Analysis** - annotations, value labels, error bars, trend lines, a crosshair, synced cursors
- **Exploring** - zoom, pan, brush and a range slider
- **Scale** - automatic downsampling (LTTB or min-max), `appendData` for a live feed, and a canvas
  renderer for tens of thousands of marks

And on every chart but the fixed-size `Sparkline`: `update()` to change data in place, legends that hide and show entries, animation
that respects reduced motion, `onPointClick`, keyboard navigation with each mark read aloud, patterns
for readers who can't tell the hues apart, and export to CSV, SVG and PNG.

```tsx
import { LineChart } from "@velotype/velochart"
import { getComponent } from "@velotype/velotype"

// A JSX tag evaluates to the element, so getComponent is how to reach the chart's methods
const chart = getComponent<LineChart>(<LineChart zoom="x" data={days} series={series}/>)
chart.update({data: newDays})
const csv = chart.toCsv()
```

## Development

From the repository root:

- `deno check src/index.ts` - type-check the library
- `deno lint` - a CI gate; `jsx-key` is excluded in `deno.json` because velotype's JSX has no `key`
  prop
- `deno task test` - bundle the gallery and run the test suite (headless Chrome via Astral)
- `deno task check-baseline` - refuse web features that are not Baseline widely available
- `deno task size` - measure the whole library bundled and minified, raw and gzipped
- `cd showcase && deno task dev` - build and serve the showcase on `http://localhost:4000`

`main` is protected: every change goes through a pull request, and the CI checks are the review. See
[CLAUDE.md](CLAUDE.md) for the conventions a new chart follows.

## License

MIT
