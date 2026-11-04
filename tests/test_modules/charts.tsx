import {replaceElementWithRoot, Component} from "@velotype/velotype"
import type {EmptyAttrs} from "@velotype/velotype"

import { Statistic, setThemeOnSelector, Theme } from "@velotype/velodesign"
import { AreaChart, BarChart, Gauge, LineChart, PieChart, Sparkline } from "../../src/index.ts"
import type { ChartPointType, ChartSeriesType } from "../../src/index.ts"
import { TestModulePage } from "./module-page.tsx"

/**
 * One gallery page for every chart rather than one per component.
 *
 * The charts share a stylesheet, a palette and a frame, and the thing most worth eyeballing is
 * whether they look like *each other* - which a page per chart makes harder to see, not easier.
 */

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"]
const revenue = [12, 19, 15, 27, 24, 31, 29, 38]
const costs = [8, 11, 10, 15, 14, 17, 16, 19]

const trend: ChartPointType[] = months.map((label, i) => ({
    label, values: {revenue: revenue[i], costs: costs[i]}
}))
const twoSeries: ChartSeriesType[] = [
    {key: "revenue", label: "Revenue"},
    {key: "costs", label: "Costs"}
]

const departments: ChartPointType[] = [
    {label: "Platform", values: {headcount: 24}},
    {label: "Growth", values: {headcount: 18}},
    {label: "Infra", values: {headcount: 12}},
    {label: "Design", values: {headcount: 7}},
    {label: "Success", values: {headcount: 15}}
]

const money = (n: number) => `$${n}k`

class ChartsGallery extends Component<EmptyAttrs> {
    override render() {
        return <div style={{marginTop: "10px", display: "flex", flexDirection: "column", gap: "28px"}}>
            <div>
                <h3>LineChart</h3>
                <div id="default-line-chart"><LineChart
                    data={trend} series={twoSeries} height={200}
                    formatValue={money} ariaLabel="Revenue and costs by month"/></div>
            </div>
            <div>
                <h3>AreaChart, stacked</h3>
                <div id="stacked-area-chart"><AreaChart
                    data={trend} series={twoSeries} stacked height={200}
                    formatValue={money} ariaLabel="Revenue and costs stacked by month"/></div>
            </div>
            <div>
                <h3>BarChart</h3>
                <div id="default-bar-chart"><BarChart title="Revenue by quarter"
                    data={trend} series={twoSeries} height={200}
                    formatValue={money} ariaLabel="Revenue and costs by month"/></div>
            </div>
            <div>
                <h3>BarChart, stacked</h3>
                <div id="stacked-bar-chart"><BarChart
                    data={trend} series={twoSeries} stacked height={200}
                    formatValue={money} ariaLabel="Revenue and costs stacked by month"/></div>
            </div>
            <div>
                <h3>BarChart, horizontal</h3>
                <div id="horizontal-bar-chart"><BarChart
                    data={departments} series={[{key: "headcount", label: "Headcount"}]}
                    horizontal height={200} title="Headcount by department"/></div>
            </div>
            <div>
                <h3>PieChart</h3>
                <div id="default-pie-chart" style={{maxWidth: "320px"}}><PieChart
                    data={departments.map(d => ({label: d.label, value: d.values.headcount ?? 0}))}
                    height={220} ariaLabel="Headcount share by department"/></div>
            </div>
            <div>
                <h3>PieChart, donut with a centre label</h3>
                <div id="donut-pie-chart" style={{maxWidth: "320px"}}><PieChart
                    data={departments.map(d => ({label: d.label, value: d.values.headcount ?? 0}))}
                    donut={0.62} centerLabel="76" centerSubLabel="people" valueLabel="Headcount" shareLabel="Of total"
                    height={220} ariaLabel="Headcount share by department"/></div>
            </div>
            <div>
                <h3>Gauge</h3>
                <div style={{display: "flex", gap: "16px", flexWrap: "wrap"}}>
                    <div id="default-gauge" style={{width: "200px"}}><Gauge
                        value={72} subLabel="of quota" formatValue={(n) => `${n}%`}
                        height={160} ariaLabel="72 percent of quota"/></div>
                    <div id="banded-gauge" style={{width: "200px"}}><Gauge
                        value={93} subLabel="disk used" formatValue={(n) => `${n}%`}
                        bands={[
                            {from: 0, to: 70, color: "var(--secondary)"},
                            {from: 70, to: 90, color: "var(--warning)"},
                            {from: 90, to: 100, color: "var(--accent)"}
                        ]}
                        height={160} ariaLabel="93 percent of disk used"/></div>
                    <div id="half-gauge" style={{width: "200px"}}><Gauge
                        value={40} sweep={180} subLabel="half sweep"
                        height={160} ariaLabel="40 of 100"/></div>
                </div>
            </div>
            <div>
                <h3>Sparkline - inline, beside the number it describes</h3>
                <div id="sparklines" style={{display: "flex", gap: "32px", flexWrap: "wrap"}}>
                    <Statistic title="Revenue" value="$38k" suffix={<Sparkline values={revenue}/>}/>
                    <Statistic title="Costs" value="$19k" suffix={<Sparkline values={costs} variant="area" color="var(--warning)"/>}/>
                    <Statistic title="Signups" value="312" suffix={<Sparkline values={[4, 9, 6, 12, 8, 15, 11, 19]} variant="bar" color="var(--secondary)"/>}/>
                </div>
            </div>
            <div>
                <h3>Empty states</h3>
                <div style={{display: "flex", gap: "16px"}}>
                    <div id="empty-line-chart" style={{flexGrow: 1}}><LineChart data={[]} series={twoSeries} height={120}/></div>
                    <div id="empty-pie-chart" style={{flexGrow: 1}}><PieChart data={[]} height={120}/></div>
                </div>
            </div>
            <div>
                <h3>Single series - no legend, and a flat series still gets an axis</h3>
                <div id="flat-line-chart"><LineChart
                    data={months.map(label => ({label, values: {v: 5}}))}
                    series={[{key: "v", label: "Flat"}]} height={140} ariaLabel="A flat series"/></div>
            </div>
        </div>
    }
}

class ChartsPage extends Component<EmptyAttrs> {
    override render() {
        return <div style={{display: "flex"}}>
            <div id="showcase-theme-light" data-theme="light" style={{padding:"8px",flexGrow: 1,minHeight: "100vh"}}><ChartsGallery/></div>
            <div id="showcase-theme-dark" data-theme="dark" style={{padding:"8px",flexGrow: 1}}><ChartsGallery/></div>
        </div>
    }
}

Theme.injectStyles()

setThemeOnSelector("#showcase-theme-light")
setThemeOnSelector("#showcase-theme-dark")

const mainPage = document.getElementById("main-page")
if (mainPage) {
    replaceElementWithRoot(<TestModulePage><ChartsPage/></TestModulePage>, mainPage)
}
