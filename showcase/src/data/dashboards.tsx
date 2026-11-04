import { Component, getComponent, RenderBasic, setStylesheet } from "@velotype/velotype"
import type { EmptyAttrs, RenderableElements } from "@velotype/velotype"

import { Card, Stack, Text } from "@velotype/velodesign"
import { AreaChart, BarChart, Gauge, LineChart, PieChart, TimeWindow, TimeWindowControl } from "@velotype/velochart"
import type { ChartPointType, TimeRange, TimeWindowPresetType } from "@velotype/velochart"

/**
 * The dashboards the showcase runs, each showing one way a page fills itself for the window it is on.
 * The data is made up, and worked out from the time alone, so a range looked at twice reads the same.
 */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const labels = {previous: "Earlier", next: "Later", zoomOut: "Zoom out", live: "Live", presets: "Time range", from: "From", to: "To"}

let areStylesMounted = false

function mountDashboardStyles(): void {
    if (!areStylesMounted) {
        areStylesMounted = true
        setStylesheet(`
.vtc-dash{width:100%;min-width:0;display:flex;flex-direction:column;gap:0.75rem;}
/* The control stays in reach all the way down the page, which is the point of having one control */
.vtc-dash-toolbar{
position:sticky;
top:var(--vtc-showcase-header-height,55px);
z-index:1;
padding:0.5rem;
background-color:var(--background);
border:1px solid var(--background-4);
border-radius:0.5rem;
}
.vtc-dash-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(10em,100%),1fr));gap:0.5rem;}
.vtc-dash-panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(20em,100%),1fr));gap:0.5rem;}
/* A lone last panel takes the row rather than leaving a hole beside it. In one column this changes nothing */
.vtc-dash-panels>:last-child:nth-child(odd){grid-column:1/-1;}
.vtc-dash-tile{display:flex;flex-direction:column;gap:0.25rem;}
.vtc-dash-tile-value{font-size:1.5rem;font-variant-numeric:tabular-nums;}
.vtc-dash-busy .vtc-chart-svg{opacity:0.55;transition:opacity 0.15s;}
`, "velochart-showcase/Dashboards")
    }
}

/** Between -0.5 and 0.5, and always the same for the same moment */
function noise(time: number, seed: number): number {
    const value = Math.sin((time / SECOND % 1e7) * 12.9898 + seed) * 43758.5453
    return value - Math.floor(value) - 0.5
}

function dailyWave(time: number): number {
    return Math.sin(2 * Math.PI * (time % DAY) / DAY - Math.PI / 2)
}

/** How far into a bad deploy a moment is, from 0 to 1 */
function incident(time: number, peak: number): number {
    return Math.exp(-(((time - peak) / (25 * MINUTE)) ** 2))
}

function toFixedOrZero(value: number, digits: number): string {
    return Number.isFinite(value) ? value.toFixed(digits) : "0"
}

/** One number at the top of a dashboard, changed in place as the window moves */
function Tile(attrs: {title: string, value: RenderBasic<string>}): RenderableElements {
    return <Card>
        <div class="vtc-dash-tile">
            <Text type="muted">{attrs.title}</Text>
            <Text strong class="vtc-dash-tile-value">{attrs.value}</Text>
        </div>
    </Card>
}

type ServiceRow = {
    time: number, ok: number, client: number, server: number, p50: number, p95: number, p99: number, cpu: number, memory: number,
}

/**
 * Every chart holds a week and the window picks what is in view, so moving it costs one redraw and no
 * request. The tiles and the panels without a time axis add up what is in view once it stops moving.
 */
export class ServiceOverviewDashboard extends Component<EmptyAttrs> {
    #timeWindow = new TimeWindow({span: 6 * HOUR})
    #leave: (() => void) | undefined
    #requests = new RenderBasic<string>("")
    #errorRate = new RenderBasic<string>("")
    #latency = new RenderBasic<string>("")
    #busiest = new RenderBasic<string>("")
    #rows: ServiceRow[] = []
    #availability: Gauge | undefined
    #statuses: PieChart | undefined
    #endpoints: BarChart | undefined

    override render(): RenderableElements {
        mountDashboardStyles()
        const end = Math.floor(Date.now() / (5 * MINUTE)) * 5 * MINUTE
        const peak = end - 2 * HOUR
        const deploys = [{time: peak - 15 * MINUTE, name: "v2.4"}, {time: end - 27 * HOUR, name: "v2.3"}, {time: end - 3 * DAY, name: "v2.2"}]
        for (let time = end - 7 * DAY; time <= end; time += 5 * MINUTE) {
            const bad = incident(time, peak)
            const load = 900 + 350 * dailyWave(time) + 90 * noise(time, 1)
            this.#rows.push({
                time,
                ok: load * (1 - 0.3 * bad),
                client: load * 0.03 + 8 * noise(time, 2) + 8,
                server: 3 + 4 * Math.abs(noise(time, 3)) + bad * 240,
                p50: 42 + 8 * dailyWave(time) + 6 * noise(time, 4) + bad * 70,
                p95: 110 + 25 * dailyWave(time) + 20 * noise(time, 5) + bad * 330,
                p99: 190 + 40 * dailyWave(time) + 50 * noise(time, 6) + bad * 720,
                cpu: 45 + 16 * dailyWave(time) + 7 * noise(time, 7) + bad * 30,
                memory: 58 + 3 * dailyWave(time) + 2 * noise(time, 8) + bad * 12,
            })
        }
        const point = (row: ServiceRow, values: Record<string, number>): ChartPointType => ({x: row.time, values})
        const deployLines = deploys.map(deploy => ({type: "line" as const, axis: "x" as const, value: deploy.time, label: deploy.name, dashed: true}))
        const timeWindow = this.#timeWindow
        const whole = (n: number) => Math.round(n).toLocaleString()
        const shared = {timeWindow, animate: false, showDots: false, height: 200, xAxis: {type: "time" as const}, annotations: deployLines, formatValue: whole}

        this.#availability = getComponent<Gauge>(<Gauge title="Availability" value={100} min={95} max={100} height={200} formatValue={(n: number) => `${n.toFixed(2)}%`}
            bands={[{from: 95, to: 99, color: "var(--warning)"}, {from: 99, to: 100, color: "var(--primary)"}]}/>)
        this.#statuses = getComponent<PieChart>(<PieChart title="Responses by status" height={200} animate={false} valueLabel="Requests" shareLabel="Share" data={[{label: "2xx", value: 1}]}/>)
        this.#endpoints = getComponent<BarChart>(<BarChart title="Busiest endpoints" horizontal height={200} animate={false} hideLegend data={[{label: "/", values: {requests: 0}}]} series={[{key: "requests", label: "Requests"}]}/>)
        this.#summarise(timeWindow.getRange())

        return <div class="vtc-dash">
            <div class="vtc-dash-toolbar"><TimeWindowControl timeWindow={timeWindow} labels={labels}/></div>
            <div class="vtc-dash-tiles">
                <Tile title="Requests" value={this.#requests}/>
                <Tile title="Error rate" value={this.#errorRate}/>
                <Tile title="Worst p95" value={this.#latency}/>
                <Tile title="Busiest minute" value={this.#busiest}/>
            </div>
            <div class="vtc-dash-panels">
                <Card><AreaChart {...shared} title="Requests per second" stacked
                    data={this.#rows.map(row => point(row, {ok: row.ok, client: row.client, server: row.server}))}
                    series={[{key: "ok", label: "2xx"}, {key: "client", label: "4xx", color: "var(--accent)"}, {key: "server", label: "5xx", color: "var(--warning)"}]}/></Card>
                <Card><LineChart {...shared} title="Latency" yAxis={{format: (n: number) => `${Math.round(n)} ms`}}
                    annotations={[...deployLines, {type: "line", axis: "y", value: 400, label: "SLO", color: "var(--warning)"}]}
                    data={this.#rows.map(row => point(row, {p50: row.p50, p95: row.p95, p99: row.p99}))}
                    series={[{key: "p50", label: "p50"}, {key: "p95", label: "p95"}, {key: "p99", label: "p99"}]}/></Card>
                <Card><BarChart {...shared} title="Server errors" hover="index"
                    data={this.#rows.filter((_, i) => i % 3 === 0).map(row => point(row, {server: row.server}))}
                    series={[{key: "server", label: "5xx", color: "var(--warning)"}]}/></Card>
                <Card><LineChart {...shared} title="Saturation" yAxis={{min: 0, max: 100, format: (n: number) => `${Math.round(n)}%`}}
                    data={this.#rows.map(row => point(row, {cpu: row.cpu, memory: row.memory}))}
                    series={[{key: "cpu", label: "CPU"}, {key: "memory", label: "Memory"}]}/></Card>
                <Card>{this.#availability}</Card>
                <Card>{this.#statuses}</Card>
                <Card>{this.#endpoints}</Card>
            </div>
        </div>
    }

    override mount(): void {
        this.#leave = this.#timeWindow.subscribeSettled((range) => this.#summarise(range))
    }

    override unmount(): void {
        this.#leave?.()
    }

    #summarise(range: TimeRange): void {
        let ok = 0, client = 0, server = 0, worst = 0, busiest = 0
        for (const row of this.#rows) {
            if (row.time >= range.from && row.time <= range.to) {
                ok += row.ok
                client += row.client
                server += row.server
                worst = Math.max(worst, row.p95)
                busiest = Math.max(busiest, row.ok + row.client + row.server)
            }
        }
        const total = ok + client + server
        this.#requests.value = Math.round(total * 300).toLocaleString()
        this.#errorRate.value = `${toFixedOrZero(100 * server / total, 2)}%`
        this.#latency.value = `${worst.toFixed(0)} ms`
        this.#busiest.value = `${Math.round(busiest * 60).toLocaleString()}/min`
        this.#availability?.update({value: total > 0 ? 100 * (1 - server / total) : 100})
        this.#statuses?.update({data: [{label: "2xx", value: ok}, {label: "4xx", value: client, color: "var(--accent)"}, {label: "5xx", value: server, color: "var(--warning)"}]})
        this.#endpoints?.update({data: [["/api/orders", 0.42], ["/api/search", 0.27], ["/api/cart", 0.18], ["/login", 0.13]].map(([label, share]) => ({label: label as string, values: {requests: Math.round(total * 300 * (share as number))}}))})
    }
}

const livePresets: TimeWindowPresetType[] = [{span: MINUTE}, {span: 5 * MINUTE}, {span: 15 * MINUTE}, {span: HOUR}]

function liveRow(time: number): {x: number, values: {cpu: number, memory: number, sent: number, received: number, rate: number}} {
    const drift = Math.sin(time / (3 * MINUTE))
    return {x: time, values: {
        cpu: 48 + 18 * drift + 14 * noise(time, 1),
        memory: 62 + 4 * Math.sin(time / (11 * MINUTE)) + noise(time, 2),
        sent: 30 + 12 * drift + 10 * noise(time, 3),
        received: 55 + 16 * Math.cos(time / (4 * MINUTE)) + 14 * noise(time, 4),
        rate: 700 + 180 * drift + 160 * noise(time, 5),
    }}
}

/**
 * A feed appends to the charts every second while the window follows the clock. Stopping the window, by
 * the button or by dragging a range on a chart, holds the view still for a look while the feed carries on.
 */
export class LiveDashboard extends Component<EmptyAttrs> {
    #timeWindow = new TimeWindow({span: 5 * MINUTE, live: true, refreshMs: SECOND})
    #timer = 0
    #charts: (LineChart | AreaChart | BarChart)[] = []
    #cpu: Gauge | undefined
    #memory: Gauge | undefined
    #rate = new RenderBasic<string>("")
    #last = 0

    override render(): RenderableElements {
        mountDashboardStyles()
        const end = Math.floor(Date.now() / SECOND) * SECOND
        const history = []
        for (let time = end - HOUR; time <= end; time += SECOND) {
            history.push(liveRow(time))
        }
        this.#last = end
        const timeWindow = this.#timeWindow
        const shared = {timeWindow, animate: false, showDots: false, height: 180, xAxis: {type: "time" as const}, formatValue: (n: number) => Math.round(n).toLocaleString()}
        this.#charts = [
            getComponent<LineChart>(<LineChart {...shared} title="CPU and memory" yAxis={{min: 0, max: 100, format: (n: number) => `${Math.round(n)}%`}} data={history} series={[{key: "cpu", label: "CPU"}, {key: "memory", label: "Memory"}]}/>),
            getComponent<AreaChart>(<AreaChart {...shared} title="Network, MB/s" data={history} series={[{key: "received", label: "Received"}, {key: "sent", label: "Sent"}]}/>),
            getComponent<LineChart>(<LineChart {...shared} title="Requests per second" data={history} downsample={{algorithm: "min-max"}} series={[{key: "rate", label: "Requests"}]}/>),
        ]
        this.#cpu = getComponent<Gauge>(<Gauge title="CPU now" value={history[history.length - 1].values.cpu} height={160} formatValue={(n: number) => `${n.toFixed(0)}%`}/>)
        this.#memory = getComponent<Gauge>(<Gauge title="Memory now" value={history[history.length - 1].values.memory} height={160} formatValue={(n: number) => `${n.toFixed(0)}%`}/>)
        this.#rate.value = `${history[history.length - 1].values.rate.toFixed(0)}/s`
        return <div class="vtc-dash">
            <div class="vtc-dash-toolbar"><TimeWindowControl timeWindow={timeWindow} presets={livePresets} labels={labels}/></div>
            <div class="vtc-dash-tiles">
                <Card>{this.#cpu}</Card>
                <Card>{this.#memory}</Card>
                <Tile title="Requests right now" value={this.#rate}/>
            </div>
            <Stack direction="column" gap="sm">
                {this.#charts.map(chart => <Card>{chart}</Card>)}
            </Stack>
        </div>
    }

    override mount(): void {
        this.#timer = setInterval(() => this.#feed(), SECOND)
    }

    override unmount(): void {
        clearInterval(this.#timer)
    }

    #feed(): void {
        const now = Math.floor(Date.now() / SECOND) * SECOND
        const fresh = []
        for (let time = this.#last + SECOND; time <= now; time += SECOND) {
            fresh.push(liveRow(time))
        }
        if (fresh.length === 0) {
            return
        }
        this.#last = now
        for (const chart of this.#charts) {
            chart.appendData(fresh, {maxPoints: 7200})
        }
        const latest = fresh[fresh.length - 1].values
        this.#cpu?.update({value: latest.cpu})
        this.#memory?.update({value: latest.memory})
        this.#rate.value = `${latest.rate.toFixed(0)}/s`
    }
}

/** The steps a query may roll up to, finest first */
const steps = [10 * SECOND, 30 * SECOND, MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY]

type QueryResult = {step: number, points: ChartPointType[], tookMs: number}

/** Stands in for a metrics backend: rolls up to about 150 points for the range, and takes a while */
function queryMetrics(range: TimeRange): Promise<QueryResult> {
    const wanted = (range.to - range.from) / 150
    const step = steps.find(candidate => candidate >= wanted) ?? DAY
    const tookMs = 120 + Math.round(Math.random() * 280)
    return new Promise(resolve => setTimeout(() => {
        const points: ChartPointType[] = []
        for (let time = Math.floor(range.from / step) * step; time <= range.to; time += step) {
            points.push({x: time, values: {
                p95: 120 + 30 * dailyWave(time) + 30 * noise(time, 1),
                throughput: 800 + 300 * dailyWave(time) + 90 * noise(time, 2),
                errors: Math.max(0, 6 + 8 * noise(time, 3) + 20 * Math.max(0, noise(time, 4) - 0.42)),
            }})
        }
        resolve({step, points, tookMs})
    }, tookMs))
}

/**
 * The server holds the data, so the page asks for each range it settles on. Only the newest answer is
 * used, so a slow reply to an old range can't paint over a newer one, and the rollup follows the span.
 */
export class QueryDashboard extends Component<EmptyAttrs> {
    #timeWindow = new TimeWindow({span: 6 * HOUR})
    #leave: (() => void) | undefined
    #charts: (LineChart | AreaChart | BarChart)[] = []
    #status = new RenderBasic<string>("")
    #host: HTMLDivElement | undefined
    #latest = 0

    override render(): RenderableElements {
        mountDashboardStyles()
        const timeWindow = this.#timeWindow
        const shared = {timeWindow, animate: false, showDots: false, height: 190, xAxis: {type: "time" as const}, data: [], formatValue: (n: number) => Math.round(n).toLocaleString()}
        this.#charts = [
            getComponent<LineChart>(<LineChart {...shared} title="p95 latency" yAxis={{format: (n: number) => `${Math.round(n)} ms`}} series={[{key: "p95", label: "p95"}]}/>),
            getComponent<AreaChart>(<AreaChart {...shared} title="Throughput" series={[{key: "throughput", label: "Requests per second"}]}/>),
            getComponent<BarChart>(<BarChart {...shared} title="Errors" hover="index" series={[{key: "errors", label: "Errors", color: "var(--warning)"}]}/>),
        ]
        this.#host = <div class="vtc-dash">
            <div class="vtc-dash-toolbar">
                <Stack direction="column" gap="xs">
                    <TimeWindowControl timeWindow={timeWindow} hideLive labels={labels}/>
                    <Text type="muted" numeric>{this.#status}</Text>
                </Stack>
            </div>
            <div class="vtc-dash-panels">
                {this.#charts.map(chart => <Card>{chart}</Card>)}
            </div>
        </div> as HTMLDivElement
        return this.#host
    }

    override mount(): void {
        this.#leave = this.#timeWindow.subscribeSettled((range) => this.#load(range))
        this.#load(this.#timeWindow.getRange())
    }

    override unmount(): void {
        this.#leave?.()
        this.#latest++
    }

    async #load(range: TimeRange): Promise<void> {
        const request = ++this.#latest
        this.#host?.classList.add("vtc-dash-busy")
        this.#host?.setAttribute("aria-busy", "true")
        this.#status.value = `Querying ${new Date(range.from).toLocaleString()} to ${new Date(range.to).toLocaleString()}`
        const result = await queryMetrics(range)
        if (request !== this.#latest) {
            return
        }
        for (const chart of this.#charts) {
            chart.update({data: result.points})
        }
        this.#host?.classList.remove("vtc-dash-busy")
        this.#host?.removeAttribute("aria-busy")
        const step = result.step >= HOUR ? `${result.step / HOUR} h` : result.step >= MINUTE ? `${result.step / MINUTE} min` : `${result.step / SECOND} s`
        this.#status.value = `${result.points.length} points, one every ${step}, in ${result.tookMs} ms`
    }
}
