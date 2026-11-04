import { Component, passthroughAttrsToElement } from "./velotype.ts"
import type { RenderableElements } from "./velotype.ts"
import {
    buildLegend, ChartThemeOptions, ChartTooltip, mountChartStyles, svgEl
} from "./chart-common.ts"
import type { ChartBaseAttrsType, ChartDataTable, TooltipBounds } from "./chart-common.ts"

/**
 * The container every chart draws into: sizing, redraw-on-resize, tooltip, legend, empty state.
 *
 * **Why a ResizeObserver rather than a `viewBox`.** Scaling one fixed viewBox to the container is
 * the cheap way to be responsive, and it scales the *text* along with the drawing - tick labels end
 * up microscopic in a sidebar and oversized on a dashboard, in a library whose whole job is
 * consistent typography. So the chart instead redraws at the container's real pixel width, and
 * every label is rendered at its intended size whatever the chart's width.
 *
 * Subclasses implement `draw`, which is called with the plot's pixel dimensions and must fill the
 * supplied `<svg>`. It is called again on every resize, so it must be idempotent - `drawInto`
 * empties the element first.
 */
export abstract class ChartFrame<AttrsType extends ChartBaseAttrsType> extends Component<AttrsType> {
    #root: HTMLDivElement
    #svgHost: HTMLDivElement
    /** Holds the visually-hidden data table, when the chart has one */
    #srHost: HTMLDivElement
    #legendHost: HTMLDivElement
    #emptyHost: HTMLDivElement
    #observer: ResizeObserver | undefined
    /** Last width drawn at, so a resize that changes nothing doesn't force a redraw */
    #lastWidth = 0
    /** Drawing height of the last render, so the tooltip can clamp without a layout read */
    #lastHeight = 0
    protected tooltip: ChartTooltip
    protected chartAttrs: AttrsType

    constructor(attrs: AttrsType, children: RenderableElements[]) {
        super(attrs, children)
        mountChartStyles()
        this.chartAttrs = attrs
        this.tooltip = new ChartTooltip()

        this.#svgHost = document.createElement("div")
        this.#srHost = document.createElement("div")
        this.#srHost.className = "vtc-chart-sr"
        this.#legendHost = document.createElement("div")
        this.#emptyHost = document.createElement("div")
        this.#emptyHost.className = "vtc-chart-empty"
        this.#emptyHost.hidden = true

        this.#root = document.createElement("div")
        this.#root.className = "vtc-chart"
        if (attrs.title !== undefined && attrs.title !== "") {
            const titleEl = document.createElement("div")
            titleEl.className = "vtc-chart-title"
            titleEl.textContent = attrs.title
            this.#root.appendChild(titleEl)
        }
        this.#root.appendChild(this.#svgHost)
        this.#root.appendChild(this.#srHost)
        this.#root.appendChild(this.#emptyHost)
        this.#root.appendChild(this.#legendHost)
        this.#root.appendChild(this.tooltip.element)

        passthroughAttrsToElement<HTMLDivElement>(this.#root, attrs)
    }

    override mount() {
        // The first measurement has to happen after the element is in the document - before that
        // its width is 0 and every chart would draw into nothing.
        this.#observer = new ResizeObserver(() => this.#redraw())
        this.#observer.observe(this.#root)
        this.#redraw()
    }

    override unmount() {
        this.#observer?.disconnect()
        this.#observer = undefined
    }

    #redraw(): void {
        const width = Math.floor(this.#root.clientWidth)
        if (width <= 0 || width === this.#lastWidth) {
            return
        }
        this.#lastWidth = width
        this.drawInto(width)
    }

    /** Rebuilds the whole drawing at `width` px, plus the legend and empty state */
    protected drawInto(width: number): void {
        const attrs = this.chartAttrs
        const height = attrs.height ?? 220
        this.#lastHeight = height

        if (this.isEmpty()) {
            this.#svgHost.replaceChildren()
            this.#srHost.replaceChildren()
            this.#legendHost.replaceChildren()
            this.#emptyHost.hidden = false
            this.#emptyHost.style.height = `${height}px`
            this.#emptyHost.replaceChildren(
                document.createTextNode(attrs.emptyMessage ?? String(ChartThemeOptions.emptySymbol({}, [])))
            )
            return
        }
        this.#emptyHost.hidden = true

        const svg = svgEl("svg", {
            class: "vtc-chart-svg",
            width: width,
            height: height,
            viewBox: `0 0 ${width} ${height}`
        })

        // Two ways to be readable, and which one applies depends on whether the chart has values a
        // table can hold. A table is much the better of the two - it carries the actual numbers
        // rather than just a name - so a chart that can produce one hides the drawing from
        // assistive tech entirely and lets the table be the content.
        const table = this.dataTable()
        if (table) {
            svg.setAttribute("aria-hidden", "true")
            this.#srHost.replaceChildren(buildDataTable(attrs.ariaLabel ?? attrs.title, table))
        } else {
            svg.setAttribute("role", "img")
            const name = attrs.ariaLabel ?? attrs.title
            if (name !== undefined) {
                svg.setAttribute("aria-label", name)
            }
            this.#srHost.replaceChildren()
        }

        this.draw(svg, width, height)
        this.#svgHost.replaceChildren(svg)

        const entries = attrs.hideLegend ? [] : this.legendEntries()
        const legend = buildLegend(entries)
        this.#legendHost.replaceChildren(...(legend ? [legend] : []))
    }

    /** Forces a redraw at the current width - for a subclass whose state changed */
    protected redrawNow(): void {
        if (this.#lastWidth > 0) {
            this.drawInto(this.#lastWidth)
        }
    }

    /** Formats a value for ticks and tooltips */
    protected format(value: number): string {
        return (this.chartAttrs.formatValue ?? String)(value)
    }

    /**
     * The box the tooltip must stay inside.
     *
     * Returns the dimensions recorded at draw time rather than reading `clientHeight`: this is
     * called from `pointermove`, and a layout read there costs a forced reflow per move for a
     * number the frame already knows.
     */
    protected containerBounds(): TooltipBounds {
        return {width: this.#lastWidth, height: this.#lastHeight}
    }

    /** True when there is nothing to draw, so the empty state shows instead */
    protected abstract isEmpty(): boolean

    /** Fills `svg` with the chart at these pixel dimensions */
    protected abstract draw(svg: SVGElement, width: number, height: number): void

    /** Legend entries; return `[]` for a chart that doesn't warrant one */
    protected abstract legendEntries(): {label: string, color: string}[]

    /**
     * The chart's values as a table, for screen readers - or `undefined` for a chart whose reading
     * is a single number the `ariaLabel` already states, like `Gauge`.
     */
    protected abstract dataTable(): ChartDataTable | undefined

    override render(): HTMLDivElement {
        return this.#root
    }
}

/**
 * Builds the visually-hidden table a screen reader reads instead of the drawing.
 *
 * **Never an SVG `<title>` element.** A `<title>` makes browsers pop their own native tooltip on
 * hover - slow, unstyled, unpositionable, and directly in the way of the chart's own tooltip - and
 * it contributes nothing, because `aria-label` already wins the accessible-name computation. This
 * component used to set both; the `<title>` was pure visual noise.
 */
function buildDataTable(caption: string | undefined, table: ChartDataTable): HTMLTableElement {
    const element = document.createElement("table")
    if (caption !== undefined) {
        const captionEl = document.createElement("caption")
        captionEl.textContent = caption
        element.appendChild(captionEl)
    }
    const head = document.createElement("thead")
    const headRow = document.createElement("tr")
    for (const column of table.columns) {
        const th = document.createElement("th")
        th.setAttribute("scope", "col")
        th.textContent = column
        headRow.appendChild(th)
    }
    head.appendChild(headRow)
    element.appendChild(head)
    const body = document.createElement("tbody")
    for (const row of table.rows) {
        const tr = document.createElement("tr")
        row.forEach((cell, index) => {
            // The first cell of each row names the category, so it is the row's header
            const el = document.createElement(index === 0 ? "th" : "td")
            if (index === 0) {
                el.setAttribute("scope", "row")
            }
            el.textContent = cell
            tr.appendChild(el)
        })
        body.appendChild(tr)
    }
    element.appendChild(body)
    return element
}
