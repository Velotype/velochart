import { Component, getComponent, replaceElementWithRoot } from "@velotype/velotype"
import type { EmptyAttrs } from "@velotype/velotype"

import { Theme } from "@velotype/velodesign"
import { BarChart, CandlestickChart, Gauge, LineChart, TimeWindow, TimeWindowControl } from "../../src/index.ts"
import { TestModulePage } from "./module-page.tsx"

/**
 * The gallery for charts sharing a window. The clock is the test's, so a live window moves when a test
 * says rather than when it happens to be polled.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const start = Date.UTC(2026, 0, 1, 0, 0)

/** Every five minutes for a day */
const day = Array.from({length: 288}, (_, i) => ({x: start + i * 5 * MINUTE, values: {v: 10 + (i % 24), w: 5 + (i % 12)}}))
const candles = day.slice(0, 40).map(point => ({x: point.x, open: 10, high: 14, low: 8, close: 12}))

const globals = globalThis as unknown as Record<string, unknown>
const expose = <T,>(name: string, value: T): T => {
    globals[name] = value
    return value
}

const clock = expose("clock", {now: start + 12 * HOUR})
const shared = expose("shared", new TimeWindow({range: {from: start + 6 * HOUR, to: start + 8 * HOUR}, refreshMs: 50, now: () => clock.now}))
const changes = expose("changes", {all: 0, settled: 0})
shared.subscribe(() => changes.all++)
shared.subscribeSettled(() => changes.settled++)

const lineA = expose("lineA", getComponent<LineChart>(<LineChart data={day} series={[{key: "v"}]} timeWindow={shared} xAxis={{type: "time", utc: true}} height={120}/>))
const lineB = expose("lineB", getComponent<BarChart>(<BarChart hover="index" data={day} series={[{key: "w"}]} timeWindow={shared} xAxis={{type: "time", utc: true}} height={120}/>))
const panning = expose("panning", getComponent<LineChart>(<LineChart zoom="x" data={day} series={[{key: "v"}]} timeWindow={shared} xAxis={{type: "time", utc: true}} height={120}/>))
const candle = expose("candle", getComponent<CandlestickChart>(<CandlestickChart data={candles} timeWindow={shared} height={120}/>))
const categories = expose("categories", getComponent<LineChart>(<LineChart data={[{label: "a", values: {v: 1}}, {label: "b", values: {v: 2}}]} series={[{key: "v"}]} timeWindow={shared} height={120}/>))

// Starts with nothing, as a chart waiting on its first query does
const fromEmpty = expose("fromEmpty", getComponent<LineChart>(<LineChart data={[]} series={[{key: "v"}]} timeWindow={shared} xAxis={{type: "time", utc: true}} height={120}/>))

// Follows the window the way a panel with no time axis does, through a subscription
const gauge = expose("gauge", getComponent<Gauge>(<Gauge value={0} min={0} max={100} height={120}/>))
shared.subscribe(() => gauge.update({value: day.filter(point => shared.contains(point.x)).length}))

// Comes and goes, to show that a window with nothing on it stops its clock
const lonely = expose("lonely", new TimeWindow({span: HOUR, live: true, refreshMs: 20, now: () => clock.now}))
const ticks = expose("lonelyTicks", {count: 0})
expose("listenToLonely", () => lonely.subscribe(() => ticks.count++))

const live = expose("live", new TimeWindow({range: {from: start, to: start + HOUR}, refreshMs: 20, now: () => clock.now}))
const moved = expose("liveMoves", {count: 0})
live.subscribe(() => moved.count++)

// Points 100ms apart, on a window half a second wide
const fineWindow = expose("fineWindow", new TimeWindow({range: {from: start + 1123, to: start + 1623}, now: () => clock.now}))
const finePoints = Array.from({length: 60}, (_, i) => ({x: start + i * 100 + 7, values: {v: i % 7}}))
const fine = expose("fine", getComponent<LineChart>(<LineChart data={finePoints} series={[{key: "v"}]} timeWindow={fineWindow} xAxis={{type: "time", utc: true}} height={120}/>))
const narrowFine = getComponent<LineChart>(<LineChart data={finePoints} series={[{key: "v"}]} timeWindow={fineWindow} xAxis={{type: "time", utc: true}} height={120}/>)
const alwaysWindow = new TimeWindow({range: {from: start, to: start + 6 * HOUR}, now: () => clock.now})

const labelled = expose("labelled", new TimeWindow({span: HOUR, now: () => clock.now}))
const utcWindow = expose("utcWindow", new TimeWindow({range: {from: start, to: start + HOUR}, now: () => clock.now}))

class TimeWindowModule extends Component<EmptyAttrs> {
    override render() {
        return <TestModulePage>
            <div id="tw-line-a">{lineA}</div>
            <div id="tw-line-b">{lineB}</div>
            <div id="tw-panning">{panning}</div>
            <div id="tw-candle">{candle}</div>
            <div id="tw-categories">{categories}</div>
            <div id="tw-gauge">{gauge}</div>
            <div id="tw-from-empty">{fromEmpty}</div>
            <div id="tw-fine" style={{width: "340px"}}>{fine}</div>
            <div id="tw-narrow-fine" style={{width: "240px"}}>{narrowFine}</div>
            <div id="tw-fine-control"><TimeWindowControl timeWindow={fineWindow} utc/></div>
            <div id="tw-always"><TimeWindowControl timeWindow={alwaysWindow} utc precision="millisecond"/></div>
            <div id="tw-control"><TimeWindowControl timeWindow={shared} utc/></div>
            <div id="tw-labelled"><TimeWindowControl
                timeWindow={labelled}
                presets={[{span: HOUR, label: "Une heure"}, {span: 2 * HOUR}]}
                labels={{previous: "prev-name", next: "next-name", zoomOut: "out-name", live: "live-name", presets: "list-name", from: "from-name", to: "to-name"}}/></div>
            <div id="tw-utc"><TimeWindowControl timeWindow={utcWindow} utc hideLive/></div>
        </TestModulePage>
    }
}

Theme.injectStyles()
replaceElementWithRoot(<TimeWindowModule/>, document.getElementById("main-page") as HTMLElement)
