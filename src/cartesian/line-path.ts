import type { ChartCurve } from "../core/chart-common.ts"

/** A point on a line, in pixels */
export type PathPoint = {x: number, y: number}

/**
 * One run of connected points as an SVG path's commands, with no leading move.
 *
 * `"smooth"` is a monotone cubic (Fritsch-Carlson), rather than the Catmull-Rom most libraries call
 * smooth: Catmull-Rom overshoots, so a curve through 0, 0, 10 dips below zero and draws a value the
 * data never had. A monotone curve only moves between the values on either side of it.
 */
function segments(points: PathPoint[], curve: ChartCurve): string {
    const parts: string[] = []
    if (curve === "smooth" && points.length > 2) {
        const tangents = monotoneTangents(points)
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1]
            const b = points[i]
            const third = (b.x - a.x) / 3
            parts.push(`C ${a.x + third} ${a.y + tangents[i - 1] * third} ${b.x - third} ${b.y - tangents[i] * third} ${b.x} ${b.y}`)
        }
        return parts.join(" ")
    }
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]
        const b = points[i]
        if (curve === "step-after") {
            parts.push(`H ${b.x} V ${b.y}`)
        } else if (curve === "step-before") {
            parts.push(`V ${b.y} H ${b.x}`)
        } else if (curve === "step") {
            parts.push(`H ${(a.x + b.x) / 2} V ${b.y} H ${b.x}`)
        } else {
            parts.push(`L ${b.x} ${b.y}`)
        }
    }
    return parts.join(" ")
}

function monotoneTangents(points: PathPoint[]): number[] {
    const count = points.length
    const slopes: number[] = []
    for (let i = 0; i < count - 1; i++) {
        const dx = points[i + 1].x - points[i].x
        slopes.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx)
    }
    const tangents = [slopes[0]]
    for (let i = 1; i < count - 1; i++) {
        // A peak or a trough has a flat tangent, which is what stops the curve overshooting it
        tangents.push(slopes[i - 1] * slopes[i] <= 0 ? 0 : (2 * slopes[i - 1] * slopes[i]) / (slopes[i - 1] + slopes[i]))
    }
    tangents.push(slopes[count - 2])
    return tangents
}

/** An open line through `points` */
export function linePath(points: PathPoint[], curve: ChartCurve): string {
    return points.length === 0 ? "" : `M ${points[0].x} ${points[0].y} ${segments(points, curve)}`
}

/** A closed area: along `top` left to right, then back along `bottom`, each with the same curve */
export function areaPath(top: PathPoint[], bottom: PathPoint[], curve: ChartCurve): string {
    if (top.length === 0) {
        return ""
    }
    const reversed = [...bottom].reverse()
    // The same steps have to read the other way round on the way back, or the two edges disagree
    const back = curve === "step-before" ? "step-after" : curve === "step-after" ? "step-before" : curve
    return `M ${top[0].x} ${top[0].y} ${segments(top, curve)} L ${reversed[0].x} ${reversed[0].y} ${segments(reversed, back)} Z`
}
