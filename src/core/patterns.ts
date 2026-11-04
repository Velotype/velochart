import { svgEl } from "./chart-common.ts"

/**
 * Fills that tell series apart without color, for readers who can't tell the palette's hues apart and
 * for printing in one ink. Six, drawn over each series' own color in the page's background color, so
 * they follow the theme too. Past six they repeat, by which point color alone has run out as well.
 */
const PATTERN_PATHS = [
    "M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6",
    "M -2 6 L 2 10 M 0 0 L 8 8 M 6 -2 L 10 2",
    "M 0 4 H 8",
    "M 4 0 V 8",
    "M 0 4 H 8 M 4 0 V 8",
]

/** The same six for a legend swatch, which is an element and can't use an SVG pattern */
const SWATCH_BACKGROUNDS = [
    "repeating-linear-gradient(45deg,transparent 0 2px,var(--background) 2px 3px)",
    "repeating-linear-gradient(-45deg,transparent 0 2px,var(--background) 2px 3px)",
    "repeating-linear-gradient(0deg,transparent 0 2px,var(--background) 2px 3px)",
    "repeating-linear-gradient(90deg,transparent 0 2px,var(--background) 2px 3px)",
    "repeating-linear-gradient(0deg,transparent 0 2px,var(--background) 2px 3px),repeating-linear-gradient(90deg,transparent 0 2px,var(--background) 2px 3px)",
    "radial-gradient(var(--background) 1px,transparent 1.2px)",
]

/** Dashes for a line, which has no area to fill, in the same order */
const LINE_DASHES = [undefined, "8 4", "2 3", "8 3 2 3", "12 4", "4 4"]

export function patternSwatch(slot: number): string {
    return SWATCH_BACKGROUNDS[slot % SWATCH_BACKGROUNDS.length]
}

export function patternDash(slot: number): string | undefined {
    return LINE_DASHES[slot % LINE_DASHES.length]
}

/** Adds one slot's pattern to a drawing and returns the `fill` that uses it */
export function patternFill(svg: SVGElement, id: string, slot: number, color: string): string {
    if (!svg.querySelector(`#${id}`)) {
        let defs = svg.querySelector("defs")
        if (!defs) {
            defs = svgEl("defs") as unknown as SVGDefsElement
            svg.prepend(defs)
        }
        const pattern = svgEl("pattern", {id, width: 8, height: 8, patternUnits: "userSpaceOnUse"})
        pattern.appendChild(svgEl("rect", {width: 8, height: 8, fill: color}))
        const index = slot % (PATTERN_PATHS.length + 1)
        pattern.appendChild(index < PATTERN_PATHS.length
            ? svgEl("path", {d: PATTERN_PATHS[index], stroke: "var(--background)", "stroke-width": 1.5, fill: "none"})
            : svgEl("circle", {cx: 4, cy: 4, r: 1.5, fill: "var(--background)"}))
        defs.appendChild(pattern)
    }
    return `url(#${id})`
}
