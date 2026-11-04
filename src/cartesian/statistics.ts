/** Normalises an error as given in a point to how far it reaches below and above the value */
export function errorRange(error: number | [number, number] | undefined): [number, number] | undefined {
    if (error === undefined) {
        return undefined
    }
    return typeof error === "number" ? [Math.abs(error), Math.abs(error)] : [Math.abs(error[0]), Math.abs(error[1])]
}

/** The least-squares line through paired values */
export function linearFit(xs: number[], ys: number[]): {slope: number, intercept: number} {
    const count = xs.length
    let sumX = 0
    let sumY = 0
    for (let i = 0; i < count; i++) {
        sumX += xs[i]
        sumY += ys[i]
    }
    const meanX = sumX / count
    const meanY = sumY / count
    let numerator = 0
    let denominator = 0
    for (let i = 0; i < count; i++) {
        numerator += (xs[i] - meanX) * (ys[i] - meanY)
        denominator += (xs[i] - meanX) * (xs[i] - meanX)
    }
    const slope = denominator === 0 ? 0 : numerator / denominator
    return {slope, intercept: meanY - slope * meanX}
}

/** The average of each value and those before it. Undefined until there are `window` values to average */
export function movingAverage(values: number[], window: number): (number | undefined)[] {
    const size = Math.max(1, Math.floor(window))
    const averages: (number | undefined)[] = []
    let sum = 0
    for (let i = 0; i < values.length; i++) {
        sum += values[i]
        if (i >= size) {
            sum -= values[i - size]
        }
        averages.push(i >= size - 1 ? sum / size : undefined)
    }
    return averages
}
