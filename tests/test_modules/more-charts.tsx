import { Component, replaceElementWithRoot } from "@velotype/velotype"
import type { EmptyAttrs } from "@velotype/velotype"

import { setThemeOnSelector, Theme } from "@velotype/velodesign"
import {
    BoxPlotChart, CalendarHeatmap, CandlestickChart, FunnelChart, Heatmap, HistogramChart, SankeyChart, SunburstChart,
    Treemap, WaterfallChart,
} from "../../src/index.ts"
import { TestModulePage } from "./module-page.tsx"

const tree = [
    {label: "Engineering", children: [{label: "Platform", value: 40}, {label: "Apps", value: 30}]},
    {label: "Sales", children: [{label: "Direct", value: 20}, {label: "Partners", value: 10}]},
    {label: "Other", value: 5},
]

const calendar = Array.from({length: 120}, (_, i) => ({date: new Date(Date.UTC(2026, 0, 1 + i)), value: (i * 7) % 10}))

const candles = [0, 1, 2, 3, 4].map(i => ({
    x: new Date(Date.UTC(2026, 0, 5 + i)),
    open: 100 + i * 2, high: 110 + i * 2, low: 95 + i * 2, close: i % 2 === 0 ? 106 + i * 2 : 98 + i * 2,
}))

class Gallery extends Component<EmptyAttrs> {
    override render() {
        return <div style={{marginTop: "10px", display: "flex", flexDirection: "column", gap: "28px"}}>
            <div id="histogram-chart"><HistogramChart values={[1, 1, 2, 2, 2, 3, 3, 4, 5, 6, 6, 7, 9, 10]} bins={[0, 2, 4, 6, 8, 10]} height={180} countLabel="Count"/></div>
            <div id="waterfall-chart"><WaterfallChart height={200} data={[
                {label: "Start", value: 100}, {label: "Sales", value: 40}, {label: "Costs", value: -60}, {label: "End", value: 0, total: true},
            ]}/></div>
            <div id="boxplot-chart"><BoxPlotChart height={200} data={[
                {label: "A", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]},
                {label: "B", summary: {min: 2, q1: 3, median: 5, q3: 7, max: 9}},
            ]}/></div>
            <div id="candles-chart"><CandlestickChart data={candles} height={200}/></div>
            <div id="ohlc-chart"><CandlestickChart data={candles} variant="ohlc" height={160}/></div>
            <div id="heatmap-chart"><Heatmap height={180} showValues columns={["Mon", "Tue", "Wed"]} rows={["am", "pm"]} values={[[1, 2, 3], [4, undefined, 6]]}/></div>
            <div id="diverging-chart"><Heatmap height={140} diverging columns={["a", "b"]} rows={["x"]} values={[[-5, 5]]}/></div>
            <div id="calendar-chart"><CalendarHeatmap data={calendar} height={140} weekStart={1}/></div>
            <div id="treemap-chart"><Treemap data={tree} height={220}/></div>
            <div id="sunburst-chart"><SunburstChart data={tree} height={240}/></div>
            <div id="funnel-chart"><FunnelChart height={200} data={[{label: "Visits", value: 1000}, {label: "Signups", value: 400}, {label: "Paid", value: 100}]}/></div>
            <div id="sankey-chart"><SankeyChart height={240}
                nodes={[{id: "a", label: "Web"}, {id: "b", label: "Mail"}, {id: "c", label: "Trial"}, {id: "d", label: "Paid"}]}
                links={[
                    {source: "a", target: "c", value: 60}, {source: "b", target: "c", value: 40},
                    {source: "c", target: "d", value: 30}, {source: "d", target: "a", value: 5},
                ]}/></div>
        </div>
    }
}

class Page extends Component<EmptyAttrs> {
    override render() {
        return <div style={{display: "flex"}}>
            <div id="more-light" data-theme="light" style={{padding: "8px", flexGrow: 1, flexBasis: 0, minWidth: 0}}><Gallery/></div>
            <div id="more-dark" data-theme="dark" style={{padding: "8px", flexGrow: 1, flexBasis: 0, minWidth: 0}}><Gallery/></div>
        </div>
    }
}

Theme.injectStyles()
setThemeOnSelector("#more-light")
setThemeOnSelector("#more-dark")

const mainPage = document.getElementById("main-page")
if (mainPage) {
    replaceElementWithRoot(<TestModulePage><Page/></TestModulePage>, mainPage)
}
