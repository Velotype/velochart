# velochart - chart style guide

`@velotype/velochart` is a chart library written against `@velotype/velotype` (a custom JSX runtime,
not React). It follows the conventions of `@velotype/velodesign`, where these charts started; when a
question is not answered here, velodesign's CLAUDE.md is the reference for how the family works. This
file documents what every chart here follows, so a new chart looks and behaves like the rest.

## Layout

- **`src/<category>/<name>.ts`** - one file per chart, in the folder for its category. The folder and
  the chart's `group` in `showcase/src/data/docs.tsx` are the same fact, and must agree.

  | Folder | Holds |
  |---|---|
  | `cartesian/` | LineChart, AreaChart, BarChart: x and y axes |
  | `radial/` | PieChart, Gauge: drawn around a centre |
  | `inline/` | Sparkline: sized to sit in a line of text |
  | `core/` | **Not a category.** `chart-common.ts` (palette, scales, axes, legend, tooltip, stylesheet), `chart-frame.ts` (the `ChartFrame` base class), `styles.ts` (the cascade layers), `velotype.ts` (the barrel) |

- `src/index.ts` - the only public entrypoint, and the only file at the root of `src/`. A chart's
  value, attrs type and other public types get added to it in the existing flat style. Internal
  modules are not exported, apart from `ChartThemeOptions` and the shared attr types.
- A chart lives in the file its name predicts, kebab-cased. A file may also hold a close variant, as
  `line-chart.ts` holds `AreaChart`.
- **CSS classes start `vtc-`**, and the `setStylesheet` key `vtc/`. velodesign's are `vtd-`, so a page
  can use both packages' charts without one styling the other's.

## Adding a chart

1. `src/<category>/<name>.ts`, usually a `ChartFrame` subclass, plus its `src/index.ts` export.
2. A section in `tests/test_modules/charts.tsx`, which renders every chart side by side in light and
   dark. One page for all of them, because what is worth eyeballing is whether they look like each
   other.
3. `tests/basic_tests.test.ts` assertions for anything interactive or stateful.
4. `showcase/src/data/docs.tsx`: its group, description, attrs table, named types and examples. A new
   category also needs an entry in `groupOrder` and an icon in `data/category-icons.ts`.
5. The docs in the `velotype.github.io` repo (`content/docs/velochart/`), and `readme.md`'s list.

## How charts are built

**SVG is built imperatively, never in JSX.** velotype cannot emit `<svg>` at all (its `<HTML tag>`
escape hatch does not support it), and `<SVG innerHTML="...">` can't carry the per-element event
handlers hover needs. So `svgEl()` in `core/chart-common.ts` wraps `createElementNS`, and every chart
draws through it. That is also why `src/` has no `.tsx` today.

**Charts size themselves with a `ResizeObserver`, not a scaling `viewBox`.** Scaling one fixed viewBox
is the cheap way to be responsive and it scales the *text* too: microscopic ticks in a sidebar,
oversized ones on a dashboard. `ChartFrame` redraws at the container's real pixel width instead, so
`draw()` is called many times and must be idempotent. `Sparkline` is the exception and is deliberately
fixed-size: it is a glyph, with no observer, axes, legend or tooltip.

**Series colours come from `ChartThemeOptions.seriesColors`** - eight slots built from the theme's four
hues at two lightness steps. Never add a hex literal to a chart: it will look right in one theme and
wrong in the other.

**Theming is a contract of CSS custom properties, not a dependency.** The library imports velotype
alone. velodesign is a dev dependency, used by the showcase and the gallery, and its `Theme` defines
the variables charts read. Introducing a new variable into `src/` changes that contract, and the list
in `readme.md` has to change with it.

**No baked-in English.** Labels are passed by the consumer, and `ariaLabel` has no default. The known
exception is `PieChart`'s hidden table, whose "Value" and "Share" headers came across from velodesign
and need an attr.

Details worth keeping, each of which looked fine until it didn't:

- A **full-circle pie slice draws nothing**, because an SVG arc whose start and end coincide is empty,
  so `arcPath` splits a 360° sweep into two half arcs.
- A **gauge's value arc is inset** when `bands` are set, so the bands stay visible as a rim.
- A **stacked area's lower edge is the previous series' line**, not the baseline.
- The **line chart's hit target is one rect over the whole plot**, tracking the nearest category. A
  2px line is not a pointer target.
- **Tooltips show each series' own value, never its stacked running total.**
- **The tooltip is placed beside the whole cursor-to-marker span, never on it**, flipping left near the
  right edge and going above when the container is too narrow for either side.
- **No chart sets an SVG `<title>`.** `aria-label` already wins the accessible-name computation, and a
  `<title>` makes browsers pop their own native tooltip over the chart's.

**Hover does no DOM work when nothing changed.** `pointermove` fires up to ~120 times a second. The
tooltip pools its rows and writes through `Text.nodeValue`, the marker line is rewritten only when the
nearest category changes, and `containerBounds()` returns dimensions cached at draw time so the handler
never forces a reflow. A test holds this: 40 identical hovers must churn no nodes.

**Accessibility: a hidden data table, not just a label.** Every chart with tabular values implements
`dataTable()`, the frame renders it into a visually-hidden `<table>` (caption = `ariaLabel`), and the
drawing becomes `aria-hidden`. Values go through `formatValue`, so what is read aloud matches the axis.
`Gauge` returns `undefined` and keeps `role="img"` plus a label, because one number against a range is
what a label already says.

## velotype JSX gotchas

These apply to the showcase and the gallery today, and to `src/` if a chart ever uses JSX:

1. **`{condition && <jsx/>}` prints `false` or `0`** when the condition is falsy and not `undefined`.
   Use a ternary with `null`.
2. **`<ClassComponent/>` evaluates to the rendered DOM element, not the instance.** Use
   `getComponent<T>(<ClassComponent/>)` to call a method on it.
3. **A JSX value in a shared constant is built once**; embedding it twice moves it and leaves the first
   place empty. That is why `ExampleDoc.node` is a factory.
4. **A `.tsx` file in `src/` needs the `@jsxRuntime classic` and `@jsx h` pragmas**, and a `src/core/jsx.ts`
   like velodesign's. A consumer compiles this package with the `jsx` mode but not the factory, so a
   file without them calls `React.createElement`. `deno task check-jsx` catches it.

## One copy of velotype

**Everything in an app has to share one velotype.** A component class from a second copy is not a
`Component` to the first, so velotype calls it as a function and it throws "Class constructor cannot be
invoked without 'new'". Packages on JSR import `jsr:@velotype/velotype@...`, which `deno bundle
--external @velotype/velotype` does not match, so bundling a JSR package separately with velotype held
out keeps a copy inside. That is why the showcase is one bundle, unlike velodesign's, which bundles its
own local source. Bundled together, Deno resolves both packages to one copy, provided their version
ranges overlap.

## Browser support: Baseline widely available

Only web features that are [Baseline](https://web.dev/baseline) "widely available" - in Chrome, Edge,
Firefox and Safari for at least 30 months. Nothing downlevels the source. A newer feature may be an
enhancement the page works without, marked with a JS comment - `// baseline-ok: <what happens without
it>` - at the end of the line or on its own line above. Never a CSS comment inside a stylesheet string,
which would ship in every consumer's bundle.

`deno task check-baseline` enforces this in CI with the same deny-list as velodesign.

## Changes reach `main` through a pull request, and CI is the reviewer

`main` is protected: no direct pushes, no force-pushes, no deletion, squash merges only, no bypass.

| Workflow | Runs on | What it gates |
|---|---|---|
| `ci.yml` - *Typecheck, lint and publish dry run* | PR + push to main | `deno check` on the package, showcase and tests; `deno lint`; `deno task check-jsx`; `deno task check-baseline`; `deno publish --dry-run` |
| `ci.yml` - *Astral suite* | PR + push to main | `deno task test`, which bundles the gallery and drives it |
| `bundle-size.yml` | PR | Comments the size against the base branch. Advisory |
| `auto-merge.yml` | PR | Turns on GitHub's auto-merge, so a non-draft PR from a branch here merges once the required checks pass |
| `pages.yml` | Push to main | Deploys the showcase |
| `publish.yml` | Manual | `deno publish --dry-run`, then `npx jsr publish` |

**Anything meant to wait for a person must be a draft PR**: a non-draft one lands as soon as CI is green.
A merge made by the workflow token does not start the Pages deploy, so `AUTO_MERGE_TOKEN` (a token with
pull-request write access) needs to be set for merges to deploy on their own.

## The bundle size is measured, not asserted

`scripts/bundle-size.ts` bundles `src/index.ts` minified and reports raw and gzip bytes, both with
velotype inlined and with it held out. `deno task size --write` generates
`showcase/src/data/bundle-size.ts`, which is never committed, so run it once before `deno check`-ing the
showcase in a fresh clone.

**`src/core/velotype.ts` is the only module in `src/` that names `@velotype/velotype`.** esbuild emits one
import statement per source module that imports an external package and keeps it even when that module
is tree-shaken out, so going around the barrel costs every consumer bytes. The script asserts exactly
one statement.
