import { svgEl } from "./chart-common.ts"
import type { ChartDataTable } from "./chart-common.ts"

/** The presentation a stand-alone file can't get from this page's stylesheet, which the drawing relies on */
const INLINED = [
    "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "opacity",
    "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "visibility", "shape-rendering",
] as const

/** A CSV cell, quoted as RFC 4180 has it */
function csvCell(text: string): string {
    // A cell starting like a formula runs as one when a spreadsheet opens it, and a label can come from
    // anyone. Numbers are left alone, so -5 stays a number.
    const guarded = /^[=+\-@\t\r]/.test(text) && !/^[-+]?[\d.,]+%?$/.test(text) ? `'${text}` : text
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** A chart's table as CSV, with CRLF line ends as RFC 4180 has it */
export function tableToCsv(table: ChartDataTable): string {
    return [table.columns, ...table.rows].map(row => row.map(csvCell).join(",")).join("\r\n")
}

type LegendEntry = {label: string, color: string}

/**
 * A stand-alone copy of a drawing: every style written onto its element, with `var(--primary)` resolved
 * to what it means here, since none of it can reach the page's stylesheet from a file.
 *
 * The title and legend are drawn in, because a chart without them can't be read on its own.
 */
export function standaloneSvg(
    svg: SVGElement, title: string | undefined, legend: LegendEntry[], canvas: HTMLCanvasElement | undefined, host: Element
): {markup: string, width: number, height: number} {
    const copy = svg.cloneNode(true) as SVGElement
    const live = [svg, ...svg.querySelectorAll("*")]
    const copied = [copy, ...copy.querySelectorAll("*")]
    live.forEach((element, index) => {
        const style = getComputedStyle(element)
        for (const name of INLINED) {
            const value = style.getPropertyValue(name)
            if (value) {
                copied[index].setAttribute(name, value)
            }
        }
    })
    copy.querySelectorAll(".vtc-chart-hit, .vtc-chart-crosshair, .vtc-chart-crosshair-badge, .vtc-chart-crosshair-text, .vtc-chart-brush, [visibility=hidden]").forEach(element => element.remove())
    for (const element of [copy, ...copy.querySelectorAll("*")]) {
        element.removeAttribute("class")
    }

    const hostStyle = getComputedStyle(host)
    const text = hostStyle.color
    const font = hostStyle.fontFamily
    const width = Number(svg.getAttribute("width"))
    const drawing = Number(svg.getAttribute("height"))
    const top = title ? 28 : 0
    // Legend entries wrapped into rows, estimating their widths as the axes do
    const placed: {entry: LegendEntry, x: number, row: number}[] = []
    let x = 8
    let row = 0
    for (const entry of legend) {
        const needed = 18 + entry.label.length * 7 + 14
        if (x + needed > width && x > 8) {
            x = 8
            row++
        }
        placed.push({entry, x, row})
        x += needed
    }
    const legendHeight = legend.length > 0 ? (row + 1) * 20 + 8 : 0
    const height = top + drawing + legendHeight

    const root = svgEl("svg", {
        xmlns: "http://www.w3.org/2000/svg", width, height, viewBox: `0 0 ${width} ${height}`, "font-family": font,
    })
    const inner = svgEl("g", {transform: `translate(0 ${top})`})
    if (canvas) {
        inner.appendChild(svgEl("image", {href: canvas.toDataURL("image/png"), x: 0, y: 0, width, height: drawing}))
    }
    while (copy.firstChild) {
        inner.appendChild(copy.firstChild)
    }
    if (title) {
        const heading = svgEl("text", {x: width / 2, y: 18, "text-anchor": "middle", "font-weight": 600, "font-size": 15, fill: text})
        heading.textContent = title
        root.appendChild(heading)
    }
    root.appendChild(inner)
    for (const {entry, x: entryX, row: entryRow} of placed) {
        const y = top + drawing + 8 + entryRow * 20
        const probe = document.createElement("span")
        probe.style.color = entry.color
        host.appendChild(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        root.appendChild(svgEl("rect", {x: entryX, y, width: 12, height: 12, rx: 2, fill: color}))
        const label = svgEl("text", {x: entryX + 18, y: y + 10, "font-size": 12, fill: text})
        label.textContent = entry.label
        root.appendChild(label)
    }
    return {markup: new XMLSerializer().serializeToString(root), width, height}
}

/** A PNG of a stand-alone drawing, on an opaque background. `scale` multiplies its pixels */
export function svgToPng(markup: string, width: number, height: number, scale: number, background: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([markup], {type: "image/svg+xml;charset=utf-8"}))
        const image = new Image()
        image.onload = () => {
            const canvas = document.createElement("canvas")
            canvas.width = Math.ceil(width * scale)
            canvas.height = Math.ceil(height * scale)
            const context = canvas.getContext("2d")
            if (!context) {
                URL.revokeObjectURL(url)
                reject(new Error("velochart: no 2d canvas to draw the PNG on"))
                return
            }
            context.fillStyle = background
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.scale(scale, scale)
            context.drawImage(image, 0, 0)
            URL.revokeObjectURL(url)
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("velochart: the browser could not encode the PNG")), "image/png")
        }
        image.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error("velochart: the browser could not read the drawing as an image"))
        }
        image.src = url
    })
}

/** Hands a file to the browser's download */
export function saveFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
}
