import { Component, getComponent, replaceElementWithRoot } from "@velotype/velotype"
import type { EmptyAttrs } from "@velotype/velotype"

import { setThemeOnSelector, Theme } from "@velotype/velodesign"
import { BarChart, LineChart } from "../../src/index.ts"
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
