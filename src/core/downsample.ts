/** A point on a line, in pixels */
type Point = {x: number, y: number}

/** How to thin a long line: `"lttb"` keeps its shape, and `"min-max"` is guaranteed to keep every spike */
export type DownsampleAlgorithm = "lttb" | "min-max"

/**
 * Largest-Triangle-Three-Buckets: from each bucket, keeps the point forming the largest triangle with
 * the point kept before it and the average of the next bucket. A long line read at a few hundred
 * pixels looks the same, from a small fraction of its points.
 *
 * Returns the positions kept, in order, so an area's two edges can be thinned the same way.
 */
export function lttb(points: Point[], threshold: number): number[] {
    const count = points.length
    if (threshold >= count || threshold < 3) {
        return points.map((_, i) => i)
    }
    const kept = [0]
    const every = (count - 2) / (threshold - 2)
    let previous = 0
    for (let bucket = 0; bucket < threshold - 2; bucket++) {
        const nextStart = Math.floor((bucket + 1) * every) + 1
        const nextEnd = Math.min(count, Math.floor((bucket + 2) * every) + 1)
        let averageX = 0
        let averageY = 0
        for (let i = nextStart; i < nextEnd; i++) {
            averageX += points[i].x
            averageY += points[i].y
        }
        const size = Math.max(1, nextEnd - nextStart)
        averageX /= size
        averageY /= size

        let best = -1
        let bestIndex = Math.floor(bucket * every) + 1
        const a = points[previous]
        for (let i = Math.floor(bucket * every) + 1; i < nextStart; i++) {
            const area = Math.abs((a.x - averageX) * (points[i].y - a.y) - (a.x - points[i].x) * (averageY - a.y))
            if (area > best) {
                best = area
                bestIndex = i
            }
        }
        kept.push(bestIndex)
        previous = bestIndex
    }
    kept.push(count - 1)
    return kept
}

/**
 * Keeps the lowest and highest point of each bucket, in the order they came. A spike can't fall between
 * samples this way, which matters when a reader is looking for the spike.
 */
export function minMax(points: Point[], threshold: number): number[] {
    const count = points.length
    if (threshold >= count || threshold < 4) {
        return points.map((_, i) => i)
    }
    const buckets = Math.floor(threshold / 2)
    const kept: number[] = []
    for (let bucket = 0; bucket < buckets; bucket++) {
        const start = Math.floor((bucket * count) / buckets)
        const end = Math.floor(((bucket + 1) * count) / buckets)
        let low = start
        let high = start
        for (let i = start + 1; i < end; i++) {
            if (points[i].y < points[low].y) {low = i}
            if (points[i].y > points[high].y) {high = i}
        }
        if (low === high) {
            kept.push(low)
        } else {
            kept.push(Math.min(low, high), Math.max(low, high))
        }
    }
    return kept
}
