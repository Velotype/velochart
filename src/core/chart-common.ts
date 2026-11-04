import { mountStyles } from "./styles.ts"
import type { EmptyAttrs, FunctionComponent } from "./velotype.ts"

/**
 * Shared internals for every chart in this package.
 *
 * **Why the SVG is built imperatively rather than in JSX:** velotype's JSX cannot emit `<svg>` or
 * its children at all (see CLAUDE.md's "Charts") - the only options are `document.createElementNS` or velotype's
 * `<SVG innerHTML="...">`. `innerHTML` is out because a chart needs per-element event handlers for
 * hover, and a string of markup has nowhere to attach them. So these helpers wrap `createElementNS`,
 * and every chart draws through them.
 *
 * Nothing here is exported from `index.ts` except `ChartThemeOptions` and the shared attr types -
 * the charts themselves are the public surface.
 */

/** Creates an SVG element with the right namespace and sets attributes in one call */
export function svgEl(tag: string, attrs?: Record<string, string | number | undefined>): SVGElement {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag) as SVGElement
    if (attrs) {
        for (const name of Object.keys(attrs)) {
            const value = attrs[name]
            if (value !== undefined) {
                element.setAttribute(name, String(value))
            }
        }
    }
    return element
}

/**
 * The colors a chart cycles through, one per series.
 *
 * Eight slots drawn from the theme's four hues at two lightness steps, so a chart themes with the
 * rest of the system and follows a consumer's palette override for free. Hardcoded hex would look
 * right in one theme and wrong in the other, which is the failure this package's "never hardcode a
 * color" rule exists to prevent.
 *
 * Override the whole array to reskin every chart at once:
 * `ChartThemeOptions.seriesColors = ["#0af", "#fa0", ...]`.
 */
export const ChartThemeOptions: {
    seriesColors: string[]
    /** Shown in place of a chart with no data (default: the U+2205 glyph) */
    emptySymbol: FunctionComponent<EmptyAttrs>
    /** Every chart fills with patterns as well as color, unless its own `patterns` says otherwise (default: `false`) */
    patterns: boolean
} = {
    patterns: false,
    seriesColors: [
        "var(--primary)",
        "var(--secondary)",
        "var(--accent)",
        "var(--warning)",
        "var(--primary-7)",
        "var(--secondary-7)",
        "var(--accent-7)",
        "var(--warning-7)"
    ],
    emptySymbol: function(){return "∅"}
}

/** Resolves a series' color: its own if it set one, otherwise its slot in the palette */
export function seriesColor(index: number, explicit?: string): string {
    if (explicit !== undefined) {
        return explicit
    }
    const palette = ChartThemeOptions.seriesColors
    return palette[index % palette.length]
}

/** How one series is drawn on a cartesian chart. `"none"` isn't drawn, and still reads in the tooltip and the hidden table */
export type ChartSeriesKind = "line" | "area" | "bar" | "scatter" | "none"

/** How a line gets from one point to the next */
export type ChartCurve = "linear" | "smooth" | "step" | "step-before" | "step-after"

/** One series in a cartesian chart */
export type ChartSeriesType = {
    /** Identifies this series, and is the key read out of each point's `values` */
    key: string
    /** Name shown in the legend and tooltip. No default - the key is used when this is unset */
    label?: string
    /** Overrides this series' palette slot with an explicit CSS color */
    color?: string
    /** How this series is drawn (default: what the chart component draws) */
    type?: ChartSeriesKind
    /** Which y axis this series reads against (default: `"left"`) */
    yAxis?: "left" | "right"
    /** How a line or area joins its points (default: `"linear"`). `"smooth"` never overshoots a value */
    curve?: ChartCurve
    /** Draws this series' line dashed (default: `false`) */
    dashed?: boolean
    /** Starts this series hidden, for a reader to turn on from the legend (default: `false`) */
    hidden?: boolean
    /** Draws a trend through this series: a least-squares line, or a moving average over `window` points */
    trendline?: "linear" | {type: "moving-average", window: number}
    /** Writes this series' values beside its marks, as `showValues` does for every series */
    showValues?: boolean
}

/** One position along the x axis, with a value per series */
export type ChartPointType = {
    /** The name shown on a category axis and in the tooltip. A numeric or time `x` formats itself when this is unset */
    label?: string
    /** Where this point sits on a numeric or time x axis. Unset, the axis is categories in the order given */
    x?: number | Date
    /** Value per series `key`; a missing key is a gap, never a zero */
    values: Record<string, number | undefined>
    /** Uncertainty per series `key`, drawn as an error bar: one number for either side, or `[below, above]` */
    errors?: Record<string, number | [number, number] | undefined>
}

/** Something drawn on a chart to mark a value or a range, rather than data */
export type ChartAnnotationType = {
    /** A line across the plot at one value */
    type: "line"
    /** Which axis the value is on (default: `"y"`) */
    axis?: "x" | "y" | "y2"
    /** A position on that axis. On a category axis, a category's label or its index */
    value: number | Date | string
    label?: string
    /** A CSS color (default: a quiet grey). Use `var(...)`, so it follows the theme */
    color?: string
    /** Draws it dashed (default: `false`) */
    dashed?: boolean
} | {
    /** A shaded range across the plot */
    type: "band"
    axis?: "x" | "y" | "y2"
    from: number | Date | string
    to: number | Date | string
    label?: string
    color?: string
} | {
    /** A labelled point */
    type: "point"
    x: number | Date | string
    y: number
    label?: string
    color?: string
}

/** A point a reader activated, as given to `onPointClick` */
export type ChartPointDetail = {
    /** The name of what was activated: its category, slice, cell or node */
    label: string
    /** Its position in the data the chart was given */
    index: number
    /** The series' `key`, on a chart that has series. Unset when the whole category was activated */
    series?: string
    /** The value, when the activated thing has exactly one */
    value?: number
}

/** One axis's configuration on a cartesian chart */
export type ChartAxisType = {
    /** What the axis measures. An x axis defaults to `"category"`, or `"time"`/`"linear"` from its points' `x`; a value axis to `"linear"` */
    type?: "category" | "linear" | "log" | "time"
    /** A title drawn along the axis */
    title?: string
    /** Fixes the low end, rather than following the data */
    min?: number
    /** Fixes the high end, rather than following the data */
    max?: number
    /** Formats this axis's ticks and the tooltip values read against it (default: `formatValue`, or a date for a time axis) */
    format?: (value: number) => string
    /** About how many ticks to draw */
    tickCount?: number
    /** Runs the axis the other way (default: `false`) */
    reverse?: boolean
    /** Leaves out the grid lines (default: `false`) */
    hideGrid?: boolean
    /** Reads a time axis in UTC rather than the browser's zone (default: `false`) */
    utc?: boolean
}

/** Attrs every chart in this package accepts */
export type ChartBaseAttrsType = {
    /** Drawing height in px, excluding the legend (default: `220`) */
    height?: number
    /**
     * A heading shown above the drawing.
     *
     * **Also becomes the chart's accessible name when `ariaLabel` is not set**, which is the reason
     * it is worth having here rather than left to the consumer to place above the component: a
     * visible title and an accessible name are the same fact, and a chart that carries one without
     * the other is either an unlabeled graphic to a screen reader or a labelled one nobody can see.
     * Set `ariaLabel` as well only when the spoken name should differ from the written one.
     *
     * Rendered as a `div` rather than a heading element: the chart does not know what level it sits
     * at, and a component that guesses produces the skipped-level outline `Heading` exists to stop.
     * Pass a `Heading` of the right level yourself if this needs to be in the document outline.
     */
    title?: string
    /**
     * Accessible name for the chart. No default - this package doesn't assume a language.
     *
     * A chart is `role="img"` to a screen reader: without this it is announced as an unlabeled
     * graphic, which is the same as not being announced at all. Set it to what the chart shows.
     */
    ariaLabel?: string
    /** Formats a value for axis ticks and tooltips (default: `String`) */
    formatValue?: (value: number) => string
    /** Shown when there is nothing to draw (default: `ChartThemeOptions.emptySymbol`) */
    emptyMessage?: string
    /** Hides the legend even when there is more than one series (default: `false`) */
    hideLegend?: boolean
    /** Animates the first drawing and changes of data, unless the reader asked for reduced motion (default: `true`) */
    animate?: boolean
    /** Lets a reader hide and show entries by clicking the legend (default: `true`) */
    legendToggle?: boolean
    /** Fills series with patterns and dashes as well as color, for readers who can't tell the hues apart (default: `ChartThemeOptions.patterns`) */
    patterns?: boolean
    /** Lets a keyboard reader move through the marks with the arrow keys (default: `true`) */
    keyboard?: boolean
    /** Called when a reader activates a point, slice, cell or node */
    onPointClick?: (detail: ChartPointDetail) => void
}

/** A chart's values in tabular form, which is what a screen reader reads instead of the drawing */
export type ChartDataTable = {
    columns: string[]
    /** One row per category; the first cell of each is the category's own name */
    rows: string[][]
}

/** The plot area inside a chart, once axis labels have taken their margins */
export type PlotBox = {
    left: number
    top: number
    width: number
    height: number
}

let areChartStylesMounted = false

/**
 * Mounts the stylesheet every chart shares, once.
 *
 * One key for the whole category, because two
 * stylesheets are two places for a tick's font size to diverge, and charts that don't match each
 * other are worse than charts that don't match anything.
 */
export function mountChartStyles(): void {
    if (areChartStylesMounted) {
        return
    }
    areChartStylesMounted = true
    mountStyles(
`
.vtc-chart{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:0.5em;position:relative;}
.vtc-chart-drawing{position:relative;}
.vtc-chart-drawing:focus-visible{outline:2px solid var(--primary-7);outline-offset:2px;border-radius:0.25rem;}
.vtc-chart-svg{display:block;width:100%;overflow:visible;}
` +
/* Visually hidden, still read aloud - the standard clip pattern. This holds each chart's data as a
   real table, so a screen reader gets the numbers rather than just the chart's name. */
`
.vtc-chart-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;}
` +
/* A Sparkline is inline content, so it sits on the text baseline rather than as its own block */
`
.vtc-sparkline{display:inline-block;vertical-align:middle;line-height:0;}
.vtc-sparkline .vtc-chart-svg{width:auto;}
.vtc-chart-gridline{stroke:var(--background-3);stroke-width:1;shape-rendering:crispedges;}
.vtc-chart-axis{stroke:var(--background-5);stroke-width:1;shape-rendering:crispedges;}
` +
/* em, not px: this is the only place in the package that would otherwise hardcode a text size,
   and an absolute value neither matches the page's typography nor follows a consumer who scales
   it. 0.85em is the same secondary-text size Badge, Tag and the DataTable footer already use. */
`
` +
/*
 * Axis text is a step darker and half a weight heavier than it was. `--background-6` at weight 400
 * measured 5.74:1 light and 7.10:1 dark, so it passed WCAG AA and was still hard to read - the
 * numbers are small, they sit beside saturated series colours that pull the eye off them, and grey
 * at 400 loses that competition. This is a legibility change rather than a compliance one.
 *
 * Not `--text`: an axis label is a reference the reader consults, not content they read, and at
 * full strength it competes with the data instead of supporting it. `--background-7` measures
 * 7.9:1 light and 8.4:1 dark against the page, which is clearly above the body text's surroundings
 * while staying visibly quieter than the plot.
 */
`
.vtc-chart-tick{fill:var(--background-7);font-size:0.85em;font-weight:500;font-family:inherit;}
.vtc-chart-tick-y{text-anchor:end;dominant-baseline:middle;}
.vtc-chart-tick-x{text-anchor:middle;}
` +
/* Lines keep their width whatever the viewBox does, so a wide chart doesn't draw hairlines */
`
.vtc-chart-line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;}
.vtc-chart-area{stroke:none;opacity:0.18;}
.vtc-chart-dot{stroke:var(--background);stroke-width:2;}
.vtc-chart-bar{transition:opacity 0.12s ease-out;}
.vtc-chart-arc{stroke:var(--background);stroke-width:2;transition:opacity 0.12s ease-out;}
.vtc-chart-hit{fill:transparent;cursor:default;}
.vtc-chart-mark{transition:opacity 0.12s ease-out;}
.vtc-chart-hover .vtc-chart-mark{opacity:0.45;}
.vtc-chart-hover .vtc-chart-mark-active{opacity:1;}
.vtc-chart-clickable .vtc-chart-mark,.vtc-chart-clickable .vtc-chart-hit{cursor:pointer;}
.vtc-chart-point{stroke:var(--background);stroke-width:1;}
.vtc-chart-whisker{stroke-width:1.5;fill:none;}
.vtc-chart-cell{stroke:var(--background);stroke-width:1;}
.vtc-chart-cell-empty{fill:var(--background-2);}
.vtc-chart-cell-label{font-size:0.8em;font-family:inherit;text-anchor:middle;dominant-baseline:middle;pointer-events:none;fill:var(--text);}
.vtc-chart-node-label{fill:var(--text);font-size:0.85em;font-family:inherit;dominant-baseline:middle;pointer-events:none;}
.vtc-chart-link{opacity:0.35;}
.vtc-chart-hover .vtc-chart-link.vtc-chart-mark{opacity:0.15;}
.vtc-chart-hover .vtc-chart-link.vtc-chart-mark-active{opacity:0.6;}
.vtc-chart-scale{display:flex;align-items:center;justify-content:center;gap:0.5em;font-size:0.85em;color:var(--text);}
.vtc-chart-scale-bar{width:8em;height:0.6em;border-radius:0.15em;}
.vtc-chart-underlay{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
.vtc-chart-underlay + .vtc-chart-svg{position:relative;}
.vtc-chart-canvas{display:block;}
.vtc-chart-zoomable{cursor:grab;}
.vtc-chart-brushable{cursor:crosshair;}
.vtc-chart-dragging{cursor:grabbing;}
.vtc-chart-brush{fill:var(--primary);opacity:0.15;stroke:var(--primary);pointer-events:none;}
.vtc-chart-slider-track{fill:var(--background-2);}
.vtc-chart-slider-line{fill:none;stroke:var(--background-6);stroke-width:1;pointer-events:none;}
.vtc-chart-slider-window{fill:var(--primary);opacity:0.18;cursor:grab;}
.vtc-chart-slider-handle{fill:var(--primary-7);cursor:ew-resize;}
.vtc-chart-annotation-line{stroke:var(--background-7);stroke-width:1;pointer-events:none;}
.vtc-chart-annotation-band{fill:var(--background-7);opacity:0.12;pointer-events:none;}
.vtc-chart-annotation-point{fill:var(--background-7);stroke:var(--background);stroke-width:2;pointer-events:none;}
.vtc-chart-annotation-label{fill:var(--text);font-size:0.8em;font-family:inherit;pointer-events:none;}
.vtc-chart-value-label{fill:var(--text);font-size:0.8em;font-family:inherit;text-anchor:middle;pointer-events:none;}
.vtc-chart-error{stroke-width:1.5;fill:none;pointer-events:none;}
.vtc-chart-trend{fill:none;stroke-width:1.5;stroke-dasharray:6 4;opacity:0.8;pointer-events:none;}
.vtc-chart-crosshair{stroke:var(--background-6);stroke-width:1;stroke-dasharray:3 3;pointer-events:none;shape-rendering:crispedges;}
.vtc-chart-crosshair-badge{fill:var(--background-7);pointer-events:none;}
.vtc-chart-crosshair-text{fill:var(--background);font-size:0.75em;font-family:inherit;dominant-baseline:middle;text-anchor:middle;pointer-events:none;}
.vtc-chart-ring{fill:none;stroke:var(--background-3);stroke-width:1;pointer-events:none;}
.vtc-chart-ring-label{dominant-baseline:middle;pointer-events:none;}
.vtc-chart-spoke{stroke:var(--background-3);stroke-width:1;}
.vtc-chart-spoke-label{dominant-baseline:middle;}
.vtc-chart-sector{fill:transparent;}
.vtc-chart-axis-title{fill:var(--background-7);font-size:0.85em;font-weight:500;font-family:inherit;text-anchor:middle;}
.vtc-chart-tick-y2{text-anchor:start;dominant-baseline:middle;}
.vtc-chart-empty{
display:flex;
align-items:center;
justify-content:center;
color:var(--background-6);
font-size:2em;
line-height:1;
}
` +
/* Legend */
`
` +
/*
 * The title sits above the drawing and inside the component, so `height` still means the drawing's
 * height and a title does not silently shrink the plot.
 */
`
.vtc-chart-title{
font-weight:600;
font-size:0.95em;
line-height:1.3;
margin-block-end:0.5em;
color:var(--text);
text-align:center;
}
.vtc-chart-legend{
display:flex;
flex-wrap:wrap;
align-items:center;
justify-content:center;
gap:0.25em 1em;
font-size:0.85em;
color:var(--background-6);
}
` +
/*
 * A legend entry names a series, which is what makes the plot readable at all, so it carries more
 * weight than a tick - it is closer to a label than to a reference value.
 */
`
.vtc-chart-legend-item{display:inline-flex;align-items:center;gap:0.4em;color:var(--text);font-weight:500;}
.vtc-chart-legend-swatch{width:0.75em;height:0.75em;border-radius:0.15em;flex-shrink:0;}
.vtc-chart-legend-toggle{appearance:none;border:0;background:none;padding:0.1em 0.2em;margin:0;font:inherit;cursor:pointer;border-radius:0.25em;}
.vtc-chart-legend-toggle:hover{background-color:var(--background-2);}
.vtc-chart-legend-toggle[aria-pressed="false"]{color:var(--background-6);text-decoration:line-through;}
.vtc-chart-legend-toggle[aria-pressed="false"] .vtc-chart-legend-swatch{opacity:0.3;}
.vtc-chart-enter .vtc-chart-marks{animation:vtc-chart-reveal 0.5s ease-out;}
.vtc-chart-enter .vtc-chart-marks-radial{animation:vtc-chart-grow 0.4s ease-out;transform-box:fill-box;transform-origin:center;}
@keyframes vtc-chart-reveal{from{clip-path:inset(-10% 100% -10% -10%);}to{clip-path:inset(-10% -10% -10% -10%);}}
@keyframes vtc-chart-grow{from{opacity:0;transform:scale(0.85);}to{opacity:1;transform:none;}}
` +
/* Tooltip - positioned by the chart, so it needs no layout of its own beyond staying on top */
`
.vtc-chart-tooltip{
position:absolute;
pointer-events:none;
z-index:10;
min-width:6em;
padding:0.4em 0.6em;
border-radius:0.25rem;
border:1px solid var(--background-4);
background-color:var(--background-1);
color:var(--text);
font-size:0.85em;
box-shadow:0 2px 8px rgba(0,0,0,0.15);
opacity:0;
transition:opacity 0.1s ease-out;
}
.vtc-chart-tooltip-visible{opacity:1;}
.vtc-chart-tooltip-title{font-weight:bold;margin-block-end:0.2em;}
.vtc-chart-tooltip-row{display:flex;align-items:center;gap:0.4em;justify-content:space-between;}
.vtc-chart-tooltip-name{display:inline-flex;align-items:center;gap:0.4em;}
.vtc-chart-tooltip-value{font-variant-numeric:tabular-nums;}
@media (prefers-reduced-motion: reduce){
.vtc-chart-bar,.vtc-chart-arc,.vtc-chart-mark,.vtc-chart-tooltip{transition:none;}
.vtc-chart-enter .vtc-chart-marks,.vtc-chart-enter .vtc-chart-marks-radial{animation:none;}
}
`, "vtc/Chart", "base")
}

/** Builds the legend row; returns undefined when there is nothing worth labelling */
export function buildLegend(
    entries: {label: string, color: string}[],
    onToggle: ((index: number) => void) | undefined,
    swatchBackground?: (slot: number) => string
): HTMLDivElement | undefined {
    if (entries.length === 0) {
        return undefined
    }
    const legend = document.createElement("div")
    legend.className = "vtc-chart-legend"
    entries.forEach((entry, index) => {
        // A real button when it does something, so keyboard and screen reader support come with it
        const item = document.createElement(onToggle ? "button" : "span")
        item.className = "vtc-chart-legend-item"
        if (onToggle) {
            (item as HTMLButtonElement).type = "button"
            item.classList.add("vtc-chart-legend-toggle")
            item.addEventListener("click", () => onToggle(index))
        }
        const swatch = document.createElement("span")
        swatch.className = "vtc-chart-legend-swatch"
        swatch.style.backgroundColor = entry.color
        if (swatchBackground) {
            swatch.style.backgroundImage = swatchBackground(index)
            swatch.style.backgroundSize = "6px 6px"
        }
        const text = document.createElement("span")
        text.textContent = entry.label
        item.appendChild(swatch)
        item.appendChild(text)
        legend.appendChild(item)
    })
    return legend
}

/**
 * What the tooltip must not cover: a horizontal span and a vertical position.
 *
 * A span rather than a point because the thing being described is rarely one pixel - on a line
 * chart it is everything between the cursor and the marker line, on a bar it is the bar's width.
 * Anchoring on a single point lets the tooltip land on the other end of that span.
 */
export type TooltipAnchor = {
    left: number
    right: number
    y: number
}

/** The box a tooltip must stay inside - the chart's own container */
export type TooltipBounds = {
    width: number
    height: number
}

/** One line in a tooltip: a colored name and its value */
export type TooltipRow = {
    label: string
    value: string
    color?: string
}

/**
 * The floating tooltip shared by every chart.
 *
 * Owned by the chart's own container (`position:relative`) rather than the document body, so it
 * cannot be orphaned if the chart unmounts mid-hover, and it clamps itself to the container's
 * width so a point near the right edge doesn't push a scrollbar onto the page.
 */
export class ChartTooltip {
    readonly element: HTMLDivElement
    #titleEl: HTMLDivElement
    #titleText: Text
    /** Row elements are reused across hovers rather than rebuilt - see `show` */
    #rows: {root: HTMLDivElement, swatch: HTMLSpanElement, label: Text, value: Text}[] = []
    /** Signature of the content currently rendered, so an unchanged hover touches no nodes */
    #contentKey = ""
    #visible = false
    /** Cached measurements, refreshed only when the content actually changes */
    #width = 0
    #height = 0

    constructor() {
        this.#titleEl = document.createElement("div")
        this.#titleEl.className = "vtc-chart-tooltip-title"
        this.#titleEl.hidden = true
        // An explicit Text node, updated through `nodeValue`. Assigning `textContent` *replaces*
        // the node, so a label that changes on every category costs a node churn per change.
        this.#titleText = document.createTextNode("")
        this.#titleEl.appendChild(this.#titleText)

        this.element = document.createElement("div")
        this.element.className = "vtc-chart-tooltip"
        this.element.setAttribute("role", "tooltip")
        // The drawing is aria-hidden and a data table carries the content, so this is a purely
        // visual affordance - announcing it as well would just repeat the table.
        this.element.setAttribute("aria-hidden", "true")
        this.element.appendChild(this.#titleEl)
    }

    /** Grows the row pool on demand; rows are never removed, only hidden */
    #row(index: number) {
        while (this.#rows.length <= index) {
            const root = document.createElement("div")
            root.className = "vtc-chart-tooltip-row"
            const name = document.createElement("span")
            name.className = "vtc-chart-tooltip-name"
            const swatch = document.createElement("span")
            swatch.className = "vtc-chart-legend-swatch"
            const labelEl = document.createElement("span")
            const label = document.createTextNode("")
            labelEl.appendChild(label)
            const valueEl = document.createElement("span")
            valueEl.className = "vtc-chart-tooltip-value"
            const value = document.createTextNode("")
            valueEl.appendChild(value)
            name.appendChild(swatch)
            name.appendChild(labelEl)
            root.appendChild(name)
            root.appendChild(valueEl)
            this.element.appendChild(root)
            this.#rows.push({root, swatch, label, value})
        }
        return this.#rows[index]
    }

    /**
     * Shows the tooltip for `rows`, positioned clear of `anchor`.
     *
     * **Rebuilds nothing when the content has not changed.** This is called from `pointermove`,
     * which fires up to ~120 times a second, and the first cut tore the tooltip's children down and
     * recreated them on every one - 60 moves inside a *single* column produced 580 mutation records
     * and 180 new nodes for a reading that never changed, plus two forced layout reads each time.
     * Now a same-content move writes two style properties and nothing else.
     */
    show(title: string, rows: TooltipRow[], anchor: TooltipAnchor, bounds: TooltipBounds): void {
        const key = `${title}\u0001${rows.map(r => `${r.label}\u0000${r.value}\u0000${r.color ?? ""}`).join("\u0002")}`
        const contentChanged = key !== this.#contentKey
        if (contentChanged) {
            this.#contentKey = key
            this.#syncContent(title, rows)
        }

        if (!this.#visible) {
            this.#visible = true
            this.element.classList.add("vtc-chart-tooltip-visible")
        }

        // Measuring forces a layout, so it only happens when the box could actually have resized
        if (contentChanged || this.#width === 0) {
            this.#width = this.element.offsetWidth
            this.#height = this.element.offsetHeight
        }
        const width = this.#width
        const height = this.#height
        const gap = 14

        // Clear of the anchor's whole span: right of its right edge, or left of its left edge when
        // that would overflow.
        let left = anchor.right + gap
        let placedBeside = true
        if (left + width > bounds.width) {
            left = anchor.left - gap - width
            if (left < 0) {
                // Neither side fits - a narrow container, which is the sidebar case rather than an
                // exotic one. Clamping horizontally here would drop the tooltip straight onto the
                // cursor, so it moves *vertically* clear instead and keeps the no-overlap promise.
                placedBeside = false
            }
        }
        left = Math.max(0, Math.min(left, Math.max(0, bounds.width - width)))

        let top: number
        if (placedBeside) {
            // Vertically centred on the anchor
            top = anchor.y - height / 2
        } else if (anchor.y - gap - height >= 0) {
            top = anchor.y - gap - height
        } else {
            top = anchor.y + gap
        }
        top = Math.max(0, Math.min(top, Math.max(0, bounds.height - height)))

        this.element.style.left = `${left}px`
        this.element.style.top = `${top}px`
    }

    /** Updates text in place, touching only the nodes whose content actually differs */
    #syncContent(title: string, rows: TooltipRow[]): void {
        const wantTitle = title.length > 0
        if (this.#titleEl.hidden === wantTitle) {
            this.#titleEl.hidden = !wantTitle
        }
        if (wantTitle && this.#titleText.nodeValue !== title) {
            this.#titleText.nodeValue = title
        }
        rows.forEach((row, index) => {
            const cells = this.#row(index)
            if (cells.root.hidden) {
                cells.root.hidden = false
            }
            if (cells.label.nodeValue !== row.label) {
                cells.label.nodeValue = row.label
            }
            if (cells.value.nodeValue !== row.value) {
                cells.value.nodeValue = row.value
            }
            const color = row.color ?? "transparent"
            if (cells.swatch.style.backgroundColor !== color) {
                cells.swatch.style.backgroundColor = color
            }
        })
        // Surplus pooled rows are hidden rather than removed, so the next hover can reuse them
        for (let index = rows.length; index < this.#rows.length; index++) {
            if (!this.#rows[index].root.hidden) {
                this.#rows[index].root.hidden = true
            }
        }
    }

    hide(): void {
        if (!this.#visible) {
            return
        }
        this.#visible = false
        this.element.classList.remove("vtc-chart-tooltip-visible")
    }
}
