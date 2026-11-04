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
} = {
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

/** One series in a cartesian chart (line, area, bar) */
export type ChartSeriesType = {
    /** Identifies this series, and is the key read out of each point's `values` */
    key: string
    /** Name shown in the legend and tooltip. No default - the key is used when this is unset */
    label?: string
    /** Overrides this series' palette slot with an explicit CSS color */
    color?: string
}

/** One category along the x axis, with a value per series */
export type ChartPointType = {
    /** The category's label, shown on the axis and in the tooltip */
    label: string
    /** Value per series `key`; a missing key is plotted as zero */
    values: Record<string, number | undefined>
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
}

/** Rounds a raw axis range out to human-readable tick values */
export function niceTicks(min: number, max: number, targetCount: number): number[] {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return [0]
    }
    if (min === max) {
        // A flat series still needs an axis; give it one tick above and below rather than a
        // degenerate zero-height scale that would divide by zero below.
        return [min - 1, min, min + 1]
    }
    const rawStep = (max - min) / Math.max(1, targetCount)
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
    // 1/2/5/10 steps are what people read as round numbers, whatever the magnitude
    const candidates = [1, 2, 5, 10].map(m => m * magnitude)
    const step = candidates.find(c => c >= rawStep) ?? candidates[candidates.length - 1]
    const start = Math.floor(min / step) * step
    const end = Math.ceil(max / step) * step
    const ticks: number[] = []
    // Accumulate with an epsilon so float drift can't drop the final tick
    for (let value = start; value <= end + step * 1e-9; value += step) {
        // Re-round each step: repeated addition of 0.1 drifts visibly by the tenth tick
        ticks.push(Number((Math.round(value / step) * step).toFixed(10)))
    }
    return ticks
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

/** Maps a value to a y pixel inside the plot box */
export function yScale(box: PlotBox, min: number, max: number): (value: number) => number {
    const span = max - min
    if (span === 0) {
        return () => box.top + box.height / 2
    }
    return (value: number) => box.top + box.height - ((value - min) / span) * box.height
}

/** Evenly spaced band centres across the plot box, one per category */
export function bandCentres(box: PlotBox, count: number): number[] {
    if (count <= 0) {
        return []
    }
    if (count === 1) {
        return [box.left + box.width / 2]
    }
    const step = box.width / count
    return Array.from({length: count}, (_, i) => box.left + step * i + step / 2)
}

/**
 * Draws the horizontal grid lines and both sets of tick labels.
 *
 * Category labels are thinned rather than rotated when they would collide: a rotated label is
 * harder to read than an absent one, and the tooltip still names every point.
 */
export function drawAxes(
    root: SVGElement,
    box: PlotBox,
    ticks: number[],
    toY: (value: number) => number,
    categories: string[],
    centres: number[],
    formatValue: (value: number) => string
): void {
    for (const tick of ticks) {
        const y = toY(tick)
        root.appendChild(svgEl("line", {
            class: "vtc-chart-gridline",
            x1: box.left, y1: y, x2: box.left + box.width, y2: y
        }))
        const label = svgEl("text", {
            class: "vtc-chart-tick vtc-chart-tick-y",
            x: box.left - 6, y: y
        })
        label.textContent = formatValue(tick)
        root.appendChild(label)
    }

    // One label per category if they fit, otherwise every nth - estimated from an average glyph
    // width rather than measured, since measuring would mean a layout pass per label.
    const longest = categories.reduce((n, c) => Math.max(n, c.length), 0)
    const perLabel = Math.max(28, longest * 8.5)
    const stride = Math.max(1, Math.ceil(perLabel / Math.max(1, box.width / Math.max(1, categories.length))))
    categories.forEach((category, index) => {
        if (index % stride !== 0) {
            return
        }
        const label = svgEl("text", {
            class: "vtc-chart-tick vtc-chart-tick-x",
            x: centres[index], y: box.top + box.height + 18
        })
        label.textContent = category
        root.appendChild(label)
    })
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
.vtc-chart-hover .vtc-chart-bar,.vtc-chart-hover .vtc-chart-arc{opacity:0.45;}
.vtc-chart-bar-active,.vtc-chart-arc-active{opacity:1 !important;}
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
.vtc-chart-bar,.vtc-chart-arc,.vtc-chart-tooltip{transition:none;}
}
`, "vtc/Chart", "base")
}

/** Builds the legend row; returns undefined when there is nothing worth labelling */
export function buildLegend(entries: {label: string, color: string}[]): HTMLDivElement | undefined {
    if (entries.length === 0) {
        return undefined
    }
    const legend = document.createElement("div")
    legend.className = "vtc-chart-legend"
    for (const entry of entries) {
        const item = document.createElement("span")
        item.className = "vtc-chart-legend-item"
        const swatch = document.createElement("span")
        swatch.className = "vtc-chart-legend-swatch"
        swatch.style.backgroundColor = entry.color
        const text = document.createElement("span")
        text.textContent = entry.label
        item.appendChild(swatch)
        item.appendChild(text)
        legend.appendChild(item)
    }
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
