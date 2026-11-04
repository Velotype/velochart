import { Component, getComponent, replaceElementWithRoot } from "@velotype/velotype"
import type { EmptyAttrs } from "@velotype/velotype"

import { setThemeOnSelector, Theme } from "@velotype/velodesign"
import { BarChart, BubbleChart, LineChart, MixedChart, PieChart, PolarAreaChart, RadarChart, ScatterChart } from "../../src/index.ts"
import { TestModulePage } from "./module-page.tsx"

/**
 * The gallery for what the charts can do, as against what they look like. One chart per behaviour,
 * each under its own id, so a test reads the one thing it is about.
 */

const gaps = [
    {label: "1", values: {a: 1, b: 2}},
    {label: "2", values: {a: 2, b: 3}},
    {label: "3", values: {a: 3}},
    {label: "4", values: {a: 4, b: 5}},
    {label: "5", values: {a: 5, b: 6}},
]
const gapSeries = [{key: "a"}, {key: "b"}]

const negatives = [
    {label: "up", values: {v: 10}},
    {label: "down", values: {v: -5}},
]
const negativeStack = [{label: "both", values: {gain: 10, loss: -5}}]

const day = 24 * 60 * 60 * 1000
const logTime = [0, 10, 20, 30].map((n, i) => ({x: new Date(Date.UTC(2026, 0, 1) + n * day), values: {requests: Math.pow(10, i + 1)}}))

const months = [
    {label: "Jan", values: {sales: 120, rate: 12, extra: 5}},
    {label: "Feb", values: {sales: 150, rate: 18, extra: 7}},
    {label: "Mar", values: {sales: 90, rate: 9, extra: 4}},
    {label: "Apr", values: {sales: 200, rate: 24, extra: 6}},
]

const ten = Array.from({length: 10}, (_, i) => ({label: `d${i}`, values: {v: i + 1}}))
const expose = <T,>(name: string, chart: T): T => {
    (globalThis as unknown as Record<string, unknown>)[name] = chart
    return chart
}
const zoomable = expose("zoomable", getComponent<LineChart>(<LineChart data={ten} series={[{key: "v"}]} zoom="x" height={160}/>))
const brushed = expose("brushed", getComponent<LineChart>(<LineChart data={ten} series={[{key: "v"}]} brush height={160} onBrush={(selection) => {
    (globalThis as unknown as {lastBrush: unknown}).lastBrush = selection
}}/>))
const slid = expose("slid", getComponent<LineChart>(<LineChart data={ten} series={[{key: "v"}]} rangeSlider height={200}/>))
const streamingData = expose("streamingData", [{x: 0, values: {v: 1}}])
const streaming = expose("streaming", getComponent<LineChart>(<LineChart data={streamingData} series={[{key: "v"}]} height={120}/>))
const syncedA = expose("syncedA", getComponent<LineChart>(<LineChart data={ten} series={[{key: "v"}]} zoom="x" syncGroup="zooming" height={100}/>))
const syncedB = expose("syncedB", getComponent<LineChart>(<LineChart data={ten} series={[{key: "v"}]} zoom="x" syncGroup="zooming" height={100}/>))

const exporting = expose("exporting", getComponent<LineChart>(<LineChart title="To export" data={[
    {label: "=SUM(A1)", values: {a: 1, b: -2}},
    {label: 'He said "hi", ok', values: {a: 3}},
]} series={[{key: "a", label: "A"}, {key: "b", label: "B"}]} height={140}/>))
const canvasExporting = expose("canvasExporting", getComponent<LineChart>(<LineChart renderer="canvas" data={ten} series={[{key: "v"}]} height={100}/>))

const updating = getComponent<BarChart>(<BarChart data={[{label: "a", values: {v: 1}}]} series={[{key: "v"}]} height={120}/>)
;(globalThis as unknown as {updatingChart: BarChart}).updatingChart = updating

class FeaturesPage extends Component<EmptyAttrs> {
    override render() {
        return <div id="features-root" data-theme="light" style={{padding: "8px", display: "flex", flexDirection: "column", gap: "24px"}}>
            <div id="gap-line"><LineChart data={gaps} series={gapSeries} height={140}/></div>
            <div id="spanned-line"><LineChart data={gaps} series={gapSeries} spanGaps height={140}/></div>
            <div id="negative-bars"><BarChart data={negatives} series={[{key: "v"}]} height={140}/></div>
            <div id="negative-stack"><BarChart data={negativeStack} series={[{key: "gain"}, {key: "loss"}]} stacked height={140}/></div>
            <div id="log-time"><LineChart
                data={logTime} series={[{key: "requests"}]} height={180}
                xAxis={{type: "time", title: "When", utc: true}} yAxis={{type: "log", title: "Requests"}}/></div>
            <div id="numeric-x"><LineChart
                data={[{x: 10, values: {v: 3}}, {x: 1, values: {v: 1}}, {x: 2, values: {v: 2}}]}
                series={[{key: "v"}]} height={140}/></div>
            <div id="updating-chart">{updating}</div>
            <div id="mixed-chart"><MixedChart
                data={months} series={[
                    {key: "sales", label: "Sales", type: "bar"},
                    {key: "rate", label: "Rate", type: "line", yAxis: "right", curve: "smooth"},
                ]} yAxis={{title: "Sales"}} yAxisRight={{title: "Rate", format: (n) => `${n}%`}} height={200}/></div>
            <div id="step-line"><LineChart data={months} series={[{key: "sales", curve: "step-after"}]} height={120}/></div>
            <div id="smooth-line"><LineChart data={[{label: "a", values: {v: 0}}, {label: "b", values: {v: 0}}, {label: "c", values: {v: 10}}]} series={[{key: "v", curve: "smooth"}]} height={120} showDots/></div>
            <div id="toggle-chart"><LineChart data={months} series={[{key: "sales"}, {key: "rate"}, {key: "extra", hidden: true}]} height={140}/></div>
            <div id="click-chart"><BarChart data={negatives} series={[{key: "v"}]} height={120} onPointClick={(detail) => {
                (globalThis as unknown as {lastClick: unknown}).lastClick = detail
            }}/></div>
            <div id="scatter-chart"><ScatterChart series={[
                {key: "a", label: "A", points: [{x: 1, y: 2}, {x: 3, y: 5}]},
                {key: "b", label: "B", points: [{x: 2, y: 8, label: "Outlier"}]},
            ]} height={160}/></div>
            <div id="bubble-chart"><BubbleChart series={[
                {key: "a", points: [{x: 1, y: 2, size: 10}, {x: 3, y: 5, size: 40}]},
            ]} height={160}/></div>
            <div id="radar-chart"><RadarChart data={months} series={[{key: "sales"}, {key: "rate"}]} height={220}/></div>
            <div id="polar-chart"><PolarAreaChart data={[{label: "a", value: 4}, {label: "b", value: 8}, {label: "c", value: 2}]} height={200}/></div>
            <div id="toggle-pie"><PieChart data={[{label: "a", value: 1}, {label: "b", value: 1}]} height={140}/></div>
            <div id="still-chart"><BarChart animate={false} data={negatives} series={[{key: "v"}]} height={100}/></div>
            <div id="annotated-chart"><LineChart data={months} series={[{key: "sales"}]} height={180} annotations={[
                {type: "line", value: 500, label: "Target", dashed: true},
                {type: "band", axis: "x", from: "Feb", to: "Mar", label: "Sale"},
                {type: "point", x: "Apr", y: 200, label: "Peak"},
            ]}/></div>
            <div id="values-chart"><BarChart data={negatives} series={[{key: "v"}]} showValues height={140} formatValue={(n) => `${n}u`}/></div>
            <div id="errors-chart"><LineChart height={160} series={[{key: "m"}]} data={[
                {label: "a", values: {m: 10}, errors: {m: 2}},
                {label: "b", values: {m: 12}, errors: {m: [1, 8]}},
            ]}/></div>
            <div id="trend-chart"><LineChart data={[1, 2, 3, 4].map(n => ({x: n, values: {v: n * 2}}))} series={[{key: "v", trendline: "linear"}]} height={140}/></div>
            <div id="average-chart"><LineChart data={[1, 5, 2, 6, 3].map((v, i) => ({x: i, values: {v}}))} series={[{key: "v", trendline: {type: "moving-average", window: 2}}]} height={140}/></div>
            <div id="crosshair-chart"><LineChart data={months} series={[{key: "sales"}]} crosshair height={160}/></div>
            <div id="sync-one"><LineChart data={months} series={[{key: "sales"}]} syncGroup="pair" height={120}/></div>
            <div id="sync-two"><LineChart data={months} series={[{key: "rate"}]} syncGroup="pair" height={120}/></div>
            <div id="zoom-chart">{zoomable}</div>
            <div id="brush-chart">{brushed}</div>
            <div id="slider-chart">{slid}</div>
            <div id="stream-chart">{streaming}</div>
            <div id="synced-a">{syncedA}</div>
            <div id="synced-b">{syncedB}</div>
            <div id="keyboard-line"><LineChart ariaLabel="Keys on a line" data={months} series={[{key: "sales", label: "Sales"}]} zoom="x" height={140} onPointClick={(detail) => {
                (globalThis as unknown as {lastKeyClick: unknown}).lastKeyClick = detail
            }}/></div>
            <div id="keyboard-bars"><BarChart data={negatives} series={[{key: "v", label: "V"}]} height={120}/></div>
            <div id="keyboard-pie"><PieChart ariaLabel="Keys on a pie" data={[{label: "x", value: 1}, {label: "y", value: 3}]} height={120}/></div>
            <div id="keyboard-off"><LineChart keyboard={false} data={months} series={[{key: "sales"}]} height={100}/></div>
            <div id="patterned-bars"><BarChart patterns data={months} series={[{key: "sales"}, {key: "rate"}]} height={140}/></div>
            <div id="patterned-lines"><LineChart patterns data={months} series={[{key: "sales"}, {key: "rate"}]} height={140}/></div>
            <div id="export-chart">{exporting}</div>
            <div id="export-canvas">{canvasExporting}</div>
            <div id="titled-chart"><LineChart title="With a title" data={gaps} series={gapSeries} height={160}/></div>
        </div>
    }
}

Theme.injectStyles()
setThemeOnSelector("#features-root")

const mainPage = document.getElementById("main-page")
if (mainPage) {
    replaceElementWithRoot(<TestModulePage><FeaturesPage/></TestModulePage>, mainPage)
}
