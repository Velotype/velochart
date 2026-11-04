# velochart

A chart library for [Velotype](https://jsr.io/@velotype/velotype) - Deno's TSX framework. Charts are
drawn in SVG at the container's real pixel width, so text stays the size it was meant to be whatever
the chart's width, and each chart with tabular values exposes them to screen readers as a
visually-hidden table.

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

`ChartThemeOptions.seriesColors` reskins every chart's palette at once.

## Charts

**Cartesian** - LineChart, AreaChart, BarChart

**Radial** - PieChart, Gauge

**Inline** - Sparkline

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
