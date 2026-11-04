import type { ChartCurve } from "../core/chart-common.ts"
import type { PathPoint } from "./line-path.ts"

/**
 * A `<canvas>` under the chart's `<svg>`, for marks too many to be elements.
 *
 * Only marks go here. Axes, annotations and the hit target stay in the SVG above it, so text stays
 * crisp and CSS-themed, and a reader's interaction is the same either way.
 */
export class CanvasMarks {
    readonly element: HTMLCanvasElement
    #context: CanvasRenderingContext2D | null
    /** A canvas can't read `var(--primary)`, so colors are resolved once each and kept for this drawing */
    #colors = new Map<string, string>()

    constructor(width: number, height: number) {
        this.element = document.createElement("canvas")
        this.element.className = "vtc-chart-canvas"
        this.#context = this.element.getContext("2d")
        this.resize(width, height)
    }

    resize(width: number, height: number): void {
        const ratio = globalThis.devicePixelRatio || 1
        this.element.width = Math.floor(width * ratio)
        this.element.height = Math.floor(height * ratio)
        this.element.style.width = `${width}px`
        this.element.style.height = `${height}px`
        // Setting a canvas's size resets its context, so this comes after
        this.#context?.setTransform(ratio, 0, 0, ratio, 0, 0)
        this.#colors.clear()
    }

    /** Clears the canvas and limits drawing to the plot */
    begin(box: {left: number, top: number, width: number, height: number}): void {
        const context = this.#context
        if (!context) {
            return
        }
        context.restore()
        context.save()
        const ratio = globalThis.devicePixelRatio || 1
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.clearRect(0, 0, this.element.width / ratio, this.element.height / ratio)
        context.beginPath()
        context.rect(box.left, box.top, box.width, box.height)
        context.clip()
    }

    /** Whatever the browser resolves a CSS color to, which is the only way to read a custom property */
    #resolve(color: string): string {
        const known = this.#colors.get(color)
        if (known !== undefined) {
            return known
        }
        this.element.style.color = color
        const resolved = getComputedStyle(this.element).color
        this.#colors.set(color, resolved)
        return resolved
    }

    /** Lines between points in the curve's way. A smooth line draws straight here: at this density no one can tell */
    #trace(context: CanvasRenderingContext2D, points: PathPoint[], curve: ChartCurve, move: boolean): void {
        for (let i = 0; i < points.length; i++) {
            const point = points[i]
            if (i === 0) {
                if (move) {
                    context.moveTo(point.x, point.y)
                } else {
                    context.lineTo(point.x, point.y)
                }
                continue
            }
            const before = points[i - 1]
            if (curve === "step-after") {
                context.lineTo(point.x, before.y)
            } else if (curve === "step-before") {
                context.lineTo(before.x, point.y)
            } else if (curve === "step") {
                const middle = (before.x + point.x) / 2
                context.lineTo(middle, before.y)
                context.lineTo(middle, point.y)
            }
            context.lineTo(point.x, point.y)
        }
    }

    line(points: PathPoint[], color: string, curve: ChartCurve, dashed: boolean): void {
        const context = this.#context
        if (!context || points.length === 0) {
            return
        }
        context.beginPath()
        context.lineWidth = 2
        context.lineJoin = "round"
        context.strokeStyle = this.#resolve(color)
        context.setLineDash(dashed ? [6, 4] : [])
        this.#trace(context, points, curve, true)
        context.stroke()
    }

    area(top: PathPoint[], bottom: PathPoint[], color: string, curve: ChartCurve): void {
        const context = this.#context
        if (!context || top.length === 0) {
            return
        }
        context.beginPath()
        context.globalAlpha = 0.18
        context.fillStyle = this.#resolve(color)
        this.#trace(context, top, curve, true)
        this.#trace(context, [...bottom].reverse(), curve === "step-before" ? "step-after" : curve === "step-after" ? "step-before" : curve, false)
        context.closePath()
        context.fill()
        context.globalAlpha = 1
    }

    circles(points: {x: number, y: number, r: number}[], color: string): void {
        const context = this.#context
        if (!context) {
            return
        }
        context.fillStyle = this.#resolve(color)
        context.beginPath()
        for (const point of points) {
            context.moveTo(point.x + point.r, point.y)
            context.arc(point.x, point.y, point.r, 0, Math.PI * 2)
        }
        context.fill()
    }

    rect(x: number, y: number, width: number, height: number, color: string): void {
        const context = this.#context
        if (context) {
            context.fillStyle = this.#resolve(color)
            context.fillRect(x, y, width, height)
        }
    }
}
