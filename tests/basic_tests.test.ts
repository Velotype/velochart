/// <reference lib="deno.ns" />

import { afterAll, beforeAll, describe, it } from "@std/testing/bdd"
import { assertEquals, fail } from "@std/assert"

import type {Server} from "@velotype/veloserver"

import { launch } from "@astral/astral"
import type { Browser, ElementHandle, Page } from "@astral/astral"
import { closeAppServer, startAppServer } from "./base_server.ts"
import type { ServerContextMetadata } from "./base_server.ts"

const server_port = 3000
const baseUrl = `http://localhost:${server_port}`

describe('chart rendering', () => {
    let server: Server<ServerContextMetadata>
    let browser: Browser
    let page: Page

    /**
     * Closes the browser if the run is cut short, so an interrupted run does not orphan a headless
     * Chrome to init.
     *
     * ⚠️ Not `Deno.addSignalListener`: a registered signal listener holds Deno's event loop open, so
     * the process would finish its tests and then never exit. `unload` keeps nothing alive. It does
     * not cover `kill -9`, which is the smaller problem.
     */
    globalThis.addEventListener("unload", () => {
        try {
            browser?.close()
        } catch {
            // Already gone, which is the outcome we wanted anyway
        }
    })

    beforeAll(async () => {
        server = await startAppServer(server_port)
        browser = await launch({
            headless: true,
            // --no-sandbox is needed in CI containers. The rest keep the browser's own footprint
            // down: this suite drives one small page at a 400x200 viewport and needs none of the
            // GPU, extension or background machinery a real browsing session does.
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-dev-shm-usage',
                '--renderer-process-limit=1',
            ]
        })
        page = await browser.newPage()
        await page.setViewportSize({ width: 400, height: 200 })
    })
    afterAll(async () => {
        await page?.close()
        await browser?.close()
        if (server) { await closeAppServer(server, 'End basic tests') }
    })

    /**
     * Which gallery modules to test, from `VTC_MODULES`. Unset means all of them.
     *
     * Every test names the module it drives, which is what makes this possible without a second
     * list to keep in step - a test cannot be filtered into the wrong bucket, because the bucket is
     * the argument it already had.
     */
    const selectedModules = (() => {
        const raw = Deno.env.get("VTC_MODULES")
        if (!raw) {
            return undefined
        }
        return new Set(raw.split(",").map(name => name.trim()).filter(name => name.length > 0))
    })()

    const itWrap = (name: string, module: string, selector: string, testFn: (selection: ElementHandle) => void | Promise<void>) => {
        it({name,
            // `ignore`, not "don't register": a skipped test is still reported, so a subset run says
            // plainly what it did not cover rather than looking like a full green run
            ignore: selectedModules !== undefined && !selectedModules.has(module),
            fn: async () => {
                try {
                    // `load`, not `networkidle2`. networkidle2 waits out a fixed idle window after
                    // the last request - measured at ~550ms per navigation against load's ~60ms,
                    // and every one of these tests navigates, so it was about 35s of the suite's
                    // runtime spent waiting for a network that had already gone quiet. The
                    // readiness that actually matters is the selector below, which is waited for
                    // either way: `load` already means the module script has run.
                    await page.goto(`${baseUrl}/${module}`, {waitUntil: 'load'})
                    const selection = await page.waitForSelector(selector)
                    if (selection) {
                        await testFn(selection)
                    } else {
                        fail(`ERROR: Selector not found`)
                    }
                } catch (e) {
                    console.log("Exception",e)
                    fail("ERROR: Thrown exception")
                }
            }
        })
    }

    itWrap("charts draw a line per series, with axis ticks and a legend", "charts", "#default-line-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("default-line-chart") as HTMLElement
            return {
                lines: root.querySelectorAll("path.vtc-chart-line").length,
                legend: root.querySelectorAll(".vtc-chart-legend-item").length,
                ticks: Array.from(root.querySelectorAll("text.vtc-chart-tick-y")).map(t => t.textContent),
                categories: Array.from(root.querySelectorAll("text.vtc-chart-tick-x")).map(t => t.textContent)
            }
        })
        if (state.lines != 2) {fail(`ERROR: expected one path per series, got ${state.lines}`)}
        if (state.legend != 2) {fail(`ERROR: expected a legend entry per series, got ${state.legend}`)}
        // niceTicks must produce round numbers through the caller's formatValue, not raw maxima
        if (!state.ticks.includes("$0k") || !state.ticks.includes("$40k")) {
            fail(`ERROR: expected rounded ticks spanning the data, got ${JSON.stringify(state.ticks)}`)
        }
        if (!state.categories.includes("Jan")) {fail(`ERROR: expected category labels, got ${JSON.stringify(state.categories)}`)}
    })

    itWrap("charts show a tooltip naming every series at the hovered category", "charts", "#default-line-chart", async (_selection: ElementHandle) => {
        // The hit target is one rect over the whole plot, so a pointer near a column is enough -
        // this is the interaction that decides whether a line chart is usable at all.
        await page.evaluate(() => {
            const root = document.getElementById("default-line-chart") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            hit.dispatchEvent(new PointerEvent("pointermove", {
                bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2
            }))
        })
        await new Promise(resolve => setTimeout(resolve, 150))
        const tip = await page.evaluate(() => {
            const root = document.getElementById("default-line-chart") as HTMLElement
            const el = root.querySelector(".vtc-chart-tooltip") as HTMLElement
            return {
                visible: el.classList.contains("vtc-chart-tooltip-visible"),
                rows: el.querySelectorAll(".vtc-chart-tooltip-row").length,
                text: el.innerText.replace(/\s+/g, " ").trim()
            }
        })
        if (!tip.visible) {fail("ERROR: expected the tooltip to appear on pointermove over the plot")}
        if (tip.rows != 2) {fail(`ERROR: expected one tooltip row per series, got ${tip.rows}`)}
        if (!tip.text.includes("Revenue") || !tip.text.includes("Costs")) {
            fail(`ERROR: expected both series named in the tooltip, got ${JSON.stringify(tip.text)}`)
        }
    })

    itWrap("charts stack bars rather than overlaying them", "charts", "#stacked-bar-chart", async (_selection: ElementHandle) => {
        // A stacked bar's two segments must sit on top of each other and together reach the
        // category total. Overlaid bars look plausible and are simply wrong, so check the geometry.
        const first = await page.evaluate(() => {
            const root = document.getElementById("stacked-bar-chart") as HTMLElement
            const bars = Array.from(root.querySelectorAll("rect.vtc-chart-bar")) as SVGRectElement[]
            const jan = bars.slice(0, 2).map(b => ({
                x: Number(b.getAttribute("x")), y: Number(b.getAttribute("y")), h: Number(b.getAttribute("height"))
            }))
            return jan
        })
        if (first.length != 2) {fail(`ERROR: expected two segments in the first category, got ${first.length}`)}
        if (first[0].x != first[1].x) {fail("ERROR: stacked segments must share an x, otherwise they are side by side")}
        // The second segment sits directly on top of the first, within a rounding pixel
        const gap = Math.abs((first[1].y + first[1].h) - first[0].y)
        if (gap > 1.5) {fail(`ERROR: expected the segments to stack flush, gap was ${gap}`)}
    })

    itWrap("charts show an empty state instead of an axis when there is no data", "charts", "#empty-line-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("empty-line-chart") as HTMLElement
            const empty = root.querySelector(".vtc-chart-empty") as HTMLElement
            return {svgs: root.querySelectorAll("svg").length, emptyShown: !empty.hidden, text: empty.innerText.trim()}
        })
        if (state.svgs != 0) {fail("ERROR: expected no drawing at all for empty data")}
        if (!state.emptyShown) {fail("ERROR: expected the empty state to be visible")}
        if (state.text.length == 0) {fail("ERROR: expected the empty state to render its symbol")}
    })

    itWrap("charts render a donut's hole and centre label", "charts", "#donut-pie-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("donut-pie-chart") as HTMLElement
            return {
                slices: root.querySelectorAll("path.vtc-chart-arc").length,
                text: Array.from(root.querySelectorAll("text")).map(t => t.textContent),
                // A ring segment's path has two arcs; a filled wedge has one and starts at the centre
                firstPath: (root.querySelector("path.vtc-chart-arc") as SVGPathElement).getAttribute("d") ?? ""
            }
        })
        if (state.slices != 5) {fail(`ERROR: expected a path per slice, got ${state.slices}`)}
        if (!state.text.includes("76")) {fail(`ERROR: expected the centre label, got ${JSON.stringify(state.text)}`)}
        if ((state.firstPath.match(/A /g) ?? []).length < 2) {
            fail("ERROR: expected a ring segment (two arcs) for a donut, not a filled wedge")
        }
    })

    itWrap("charts place the tooltip clear of the point it describes", "charts", "#default-line-chart", async (_selection: ElementHandle) => {
        // Regression: the tooltip's top-left used to be placed *at* the highest data point and
        // centred on the hovered column, so it covered exactly what the reader was pointing at.
        // It now sits beside the whole cursor-to-marker span and flips near the right edge.
        for (const fraction of [0.1, 0.4, 0.6, 0.95]) {
            const state = await page.evaluate(`(() => {
                const root = document.getElementById("default-line-chart")
                const hit = root.querySelector("rect.vtc-chart-hit")
                const box = hit.getBoundingClientRect()
                const cx = box.left + box.width * ${fraction}
                const cy = box.top + box.height * 0.5
                hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: cx, clientY: cy}))
                const tip = root.querySelector(".vtc-chart-tooltip").getBoundingClientRect()
                const marker = root.querySelector("line[visibility=visible]")
                const markerX = marker ? marker.getBoundingClientRect().left : null
                const container = root.getBoundingClientRect()
                return {
                    coversCursor: cx >= tip.left && cx <= tip.right && cy >= tip.top && cy <= tip.bottom,
                    coversMarker: markerX !== null && markerX >= tip.left && markerX <= tip.right,
                    // Placed beside the cursor (rather than above/below it) when it shares the
                    // cursor's vertical band - which is the case the marker check applies to.
                    placedBeside: cy >= tip.top && cy <= tip.bottom,
                    overflows: tip.left < container.left - 1 || tip.right > container.right + 1,
                    visible: tip.width > 0
                }
            })()`) as {coversCursor: boolean, coversMarker: boolean, placedBeside: boolean, overflows: boolean, visible: boolean}
            if (!state.visible) {fail(`ERROR: no tooltip at ${fraction * 100}% across the plot`)}
            // The invariant that always holds, whatever the container width
            if (state.coversCursor) {fail(`ERROR: tooltip sits under the cursor at ${fraction * 100}%`)}
            if (state.overflows) {fail(`ERROR: tooltip escapes the chart container at ${fraction * 100}%`)}
            // When there was room beside the cursor, it must also clear the marker line. In a
            // container too narrow for that the tooltip goes above instead, and merely crosses the
            // marker's x - the line stays visible either side of it, so this doesn't apply.
            if (state.placedBeside && state.coversMarker) {
                fail(`ERROR: tooltip placed beside the cursor still covers the marker line at ${fraction * 100}%`)
            }
        }
    })

    itWrap("charts expose their data as a hidden table, and never as an SVG title", "charts", "#default-line-chart", async (_selection: ElementHandle) => {
        // Regression: the frame used to set an SVG <title> alongside aria-label. The title added
        // nothing - aria-label already wins the accessible-name computation - and made browsers pop
        // their own native tooltip on hover, competing with the chart's.
        const titles = await page.evaluate(() => document.querySelectorAll(".vtc-chart svg title").length)
        if (titles != 0) {fail(`ERROR: found ${titles} SVG <title> elements; they trigger the native hover tooltip`)}

        const state = await page.evaluate(() => {
            const root = document.getElementById("default-line-chart") as HTMLElement
            const svg = root.querySelector("svg") as SVGSVGElement
            const sr = root.querySelector(".vtc-chart-sr") as HTMLElement
            const table = sr.querySelector("table") as HTMLTableElement
            return {
                svgHidden: svg.getAttribute("aria-hidden"),
                caption: table?.querySelector("caption")?.textContent ?? null,
                headers: Array.from(table?.querySelectorAll("thead th") ?? []).map(t => t.textContent),
                rows: table?.querySelectorAll("tbody tr").length ?? 0,
                firstRow: (table?.querySelector("tbody tr") as HTMLElement)?.innerText.replace(/\s+/g, " ").trim() ?? "",
                // Hidden from sight, not from assistive tech
                boxWidth: Math.round(sr.getBoundingClientRect().width)
            }
        })
        if (state.svgHidden != "true") {fail("ERROR: expected the drawing to be aria-hidden once a data table carries the content")}
        if (state.caption != "Revenue and costs by month") {fail(`ERROR: expected the ariaLabel as the table caption, got ${JSON.stringify(state.caption)}`)}
        if (state.rows != 8) {fail(`ERROR: expected a row per category, got ${state.rows}`)}
        if (!state.headers.includes("Revenue") || !state.headers.includes("Costs")) {
            fail(`ERROR: expected a column per series, got ${JSON.stringify(state.headers)}`)
        }
        // Values must go through the caller's formatValue, so what is read aloud matches the axis
        if (!state.firstRow.includes("$12k")) {fail(`ERROR: expected formatted values in the table, got ${JSON.stringify(state.firstRow)}`)}
        if (state.boxWidth > 1) {fail(`ERROR: the table must be visually hidden, its box is ${state.boxWidth}px wide`)}
    })

    itWrap("charts do no DOM work for a hover that changes nothing", "charts", "#default-line-chart", async (_selection: ElementHandle) => {
        // `pointermove` fires up to ~120 times a second. The first cut rebuilt the tooltip's whole
        // subtree on every one: 60 moves inside a single column produced 580 mutation records and
        // 180 new nodes for a reading that never changed. Content is now reused in place, so a
        // repeat hover must be completely inert, and a real category change must not create nodes
        // either - only mutate the text already there.
        const churn = await page.evaluate(() => {
            const root = document.getElementById("default-line-chart") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            const move = (x: number) => hit.dispatchEvent(new PointerEvent("pointermove", {
                bubbles: true, clientX: x, clientY: box.top + 40
            }))
            const fixedX = box.left + box.width * 0.5
            move(fixedX) // warm up: the first hover legitimately builds the row pool

            let added = 0, removed = 0
            const observer = new MutationObserver(() => { /* drained synchronously below */ })
            observer.observe(root, {childList: true, subtree: true, attributes: true, characterData: true})
            // A MutationObserver's callback is an async microtask, so it never runs inside this
            // synchronous block - the records have to be drained by hand. A first version of this
            // test read counters the callback would only have filled in later, and so passed
            // against the very implementation it was written to reject.
            const drain = () => {
                for (const record of observer.takeRecords()) {
                    added += record.addedNodes.length
                    removed += record.removedNodes.length
                }
            }

            for (let i = 0; i < 40; i++) { move(fixedX) }
            drain()
            const idle = {added, removed}

            added = 0; removed = 0
            // Sweep the whole plot, genuinely changing category several times
            for (let i = 0; i < 40; i++) { move(box.left + (box.width * i) / 40) }
            drain()
            const sweep = {added, removed}

            observer.disconnect()
            return {idle, sweep}
        })
        if (churn.idle.added != 0 || churn.idle.removed != 0) {
            fail(`ERROR: 40 identical hovers churned the DOM: +${churn.idle.added}/-${churn.idle.removed} nodes`)
        }
        if (churn.sweep.added != 0 || churn.sweep.removed != 0) {
            fail(`ERROR: sweeping the plot created nodes instead of updating text in place: +${churn.sweep.added}/-${churn.sweep.removed}`)
        }
    })

    itWrap("a missing value is a gap: the line breaks and the tooltip skips it", "features", "#gap-line", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("gap-line") as HTMLElement
            const spanned = document.getElementById("spanned-line") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            // Over the third of five points, which is the missing one for the "b" series
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + 5}))
            return {
                lines: root.querySelectorAll("path.vtc-chart-line").length,
                spanned: spanned.querySelectorAll("path.vtc-chart-line").length,
                tipRows: Array.from(root.querySelectorAll(".vtc-chart-tooltip-row")).filter(r => !(r as HTMLElement).hidden).length,
                cells: Array.from(root.querySelectorAll(".vtc-chart-sr tbody tr:nth-child(3) td")).map(c => c.textContent),
            }
        })
        // Series a is whole and series b is broken in two
        assertEquals(state.lines, 3)
        assertEquals(state.spanned, 2)
        assertEquals(state.tipRows, 1)
        assertEquals(state.cells, ["3", ""])
    })

    itWrap("a negative bar hangs below the zero line, and stacks build both ways", "features", "#negative-bars", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("negative-bars") as HTMLElement
            const axis = root.querySelector("line.vtc-chart-axis") as SVGLineElement
            const zero = Number(axis.getAttribute("y1"))
            const bars = Array.from(root.querySelectorAll("rect.vtc-chart-bar")).map(b => ({
                top: Number(b.getAttribute("y")), bottom: Number(b.getAttribute("y")) + Number(b.getAttribute("height")),
            }))
            const stack = Array.from(document.getElementById("negative-stack")!.querySelectorAll("rect.vtc-chart-bar")).map(b => ({
                top: Number(b.getAttribute("y")), bottom: Number(b.getAttribute("y")) + Number(b.getAttribute("height")),
            }))
            const stackZero = Number(document.getElementById("negative-stack")!.querySelector("line.vtc-chart-axis")!.getAttribute("y1"))
            return {zero, bars, stack, stackZero}
        })
        // +10 rises to the zero line, -5 hangs from it
        assertEquals(Math.round(state.bars[0].bottom), Math.round(state.zero))
        assertEquals(Math.round(state.bars[1].top), Math.round(state.zero))
        // Stacked: the +10 and -5 of one category sit either side of zero, not on top of each other
        assertEquals(Math.round(state.stack[0].bottom), Math.round(state.stackZero))
        assertEquals(Math.round(state.stack[1].top), Math.round(state.stackZero))
    })

    itWrap("axes: log ticks are powers of ten, time ticks are dates, and titles are drawn", "features", "#log-time", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("log-time") as HTMLElement
            return {
                y: Array.from(root.querySelectorAll("text.vtc-chart-tick-y")).map(t => t.textContent),
                x: Array.from(root.querySelectorAll("text.vtc-chart-tick-x")).map(t => t.textContent),
                titles: Array.from(root.querySelectorAll("text.vtc-chart-axis-title")).map(t => t.textContent),
            }
        })
        assertEquals(state.y, ["10", "100", "1000", "10000"])
        assertEquals(state.titles, ["When", "Requests"])
        if (state.x.length < 2 || !state.x.some(label => /\d/.test(label ?? ""))) {fail(`ERROR: expected date ticks, got ${JSON.stringify(state.x)}`)}
    })

    itWrap("axes: a numeric x places points by value, whatever order they came in", "features", "#numeric-x", async (_selection: ElementHandle) => {
        const dots = await page.evaluate(() => Array.from(document.getElementById("numeric-x")!.querySelectorAll("circle.vtc-chart-dot"))
            .map(c => Number(c.getAttribute("cx"))))
        assertEquals(dots.length, 3)
        // 1, 2 and 10 from an unsorted input: the gap after 2 is eight times the one before it
        const ratio = (dots[2] - dots[1]) / (dots[1] - dots[0])
        if (dots[0] >= dots[1] || Math.abs(ratio - 8) > 0.01) {fail(`ERROR: points are not placed by value: ${JSON.stringify(dots)}`)}
    })

    itWrap("update() changes the data in place, keeping the chart's element", "features", "#updating-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("updating-chart") as HTMLElement
            const chart = root.querySelector(".vtc-chart") as HTMLElement
            const before = root.querySelectorAll("rect.vtc-chart-bar").length;
            (globalThis as unknown as {updatingChart: {update: (attrs: unknown) => void}}).updatingChart.update({
                data: [{label: "a", values: {v: 1}}, {label: "b", values: {v: 2}}, {label: "c", values: {v: 3}}],
            })
            return {
                before,
                after: root.querySelectorAll("rect.vtc-chart-bar").length,
                same: root.querySelector(".vtc-chart") === chart,
                rows: root.querySelectorAll(".vtc-chart-sr tbody tr").length,
            }
        })
        assertEquals(state, {before: 1, after: 3, same: true, rows: 3})
    })

    itWrap("a chart with a title keeps its tooltip level with the pointer", "features", "#titled-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("titled-chart") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            const y = box.top + box.height / 2
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.left + 10, clientY: y}))
            const tip = (root.querySelector(".vtc-chart-tooltip") as HTMLElement).getBoundingClientRect()
            return {y, top: tip.top, bottom: tip.bottom}
        })
        if (state.y < state.top || state.y > state.bottom) {fail(`ERROR: tooltip sits off the pointer: ${JSON.stringify(state)}`)}
    })

    itWrap("a pie's hidden table bakes in no English, and takes its column names from attrs", "charts", "#donut-pie-chart", async (_selection: ElementHandle) => {
        const headers = await page.evaluate(() => ({
            named: Array.from(document.getElementById("donut-pie-chart")!.querySelectorAll("thead th")).map(th => th.textContent),
            unnamed: Array.from(document.getElementById("default-pie-chart")!.querySelectorAll("thead th")).map(th => th.textContent),
        }))
        assertEquals(headers.named, ["", "Headcount", "Of total"])
        assertEquals(headers.unnamed, ["", "", ""])
    })

})
