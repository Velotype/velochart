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
