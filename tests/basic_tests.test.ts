/// <reference lib="deno.ns" />

import { afterAll, beforeAll, describe, it } from "@std/testing/bdd"
import { assertEquals, fail } from "@std/assert"

import type {Server} from "@velotype/veloserver"

import { launch } from "@astral/astral"
import type { Browser, ElementHandle, Page } from "@astral/astral"
import { closeAppServer, setOfModules, startAppServer } from "./base_server.ts"
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

    it({name: "no gallery page turns a string into DOM, under a policy that would refuse it", fn: async () => {
        // The control: a sweep that finds nothing means nothing unless the policy is really on
        await page.goto(`${baseUrl}/${setOfModules[0]}`, {waitUntil: 'load'})
        const refused = await page.evaluate(() => {
            try {
                document.createElement("div").innerHTML = "<b>x</b>"
                return false
            } catch {
                return true
            }
        })
        assertEquals(refused, true)

        const found: Record<string, string[]> = {}
        for (const module of setOfModules) {
            if (selectedModules !== undefined && !selectedModules.has(module)) {
                continue
            }
            await page.goto(`${baseUrl}/${module}`, {waitUntil: 'load'})
            const violations = await page.evaluate(() => (globalThis as unknown as {cspViolations: string[]}).cspViolations)
            if (violations.length > 0) {
                found[module] = violations
            }
        }
        assertEquals(found, {})
    }})

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

    /** Polls until an in-page check holds */
    const waitFor = async (probe: () => Promise<unknown>, timeoutMs = 3000) => {
        const started = Date.now()
        while (Date.now() - started < timeoutMs) {
            if (await probe()) {
                return
            }
            await new Promise(resolve => setTimeout(resolve, 20))
        }
        fail(`ERROR: timed out after ${timeoutMs}ms`)
    }

    /** What the window tests read back: every chart's view, and the window's own range */
    type WindowGlobals = {
        shared: {getRange: () => {from: number, to: number}, setRange: (from: number, to: number) => void, setLast: (span: number) => void, setLive: (live: boolean) => void, isLive: () => boolean, shift: (direction: number) => void, zoomOut: () => void}
        lineA: {getView: () => {xMin: number, xMax: number} | undefined, update: (attrs: unknown) => void}
        lineB: {getView: () => {xMin: number, xMax: number} | undefined}
        candle: {getView: () => {xMin: number, xMax: number} | undefined}
        categories: {getView: () => unknown}
        clock: {now: number}
    }
    const settleFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

    itWrap("a time window moves every chart on it at once, and none that has no time axis", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const g = globalThis as unknown as WindowGlobals
            const before = g.lineA.getView()
            const {from} = g.shared.getRange()
            g.shared.setRange(from + 60_000, from + 3_660_000)
            return {
                before: before !== undefined,
                a: g.lineA.getView(), b: g.lineB.getView(), candle: g.candle.getView(),
                categories: g.categories.getView() ?? null,
                range: g.shared.getRange(),
                gauge: document.querySelector("#tw-gauge .vtc-gauge-value, #tw-gauge text")?.textContent !== undefined,
            }
        })
        assertEquals(state.before, true)
        assertEquals(state.a?.xMin, state.range.from)
        assertEquals(state.a?.xMax, state.range.to)
        assertEquals(state.b?.xMin, state.range.from)
        assertEquals(state.candle?.xMax, state.range.to)
        assertEquals(state.categories, null)
    })

    itWrap("a window past the data stays there, with its axis, rather than snapping back", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const g = globalThis as unknown as WindowGlobals
            const far = Date.UTC(2030, 0, 1)
            g.shared.setRange(far, far + 3_600_000)
            g.lineA.update({series: [{key: "v"}]})
            return {xMin: g.lineA.getView()?.xMin, far}
        })
        await settleFrames()
        assertEquals(state.xMin, state.far)
        const ticks = await page.evaluate(() => document.querySelectorAll("#tw-line-a text").length)
        assertEquals(ticks > 0, true)
    })

    itWrap("dragging across one chart sets the window for all of them, and a double click steps out", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        await settleFrames()
        const box = await page.evaluate(() => {
            const r = document.querySelector("#tw-line-a svg")!.getBoundingClientRect()
            const fire = (type: string, x: number, buttons: number) => {
                document.querySelector("#tw-line-a svg")!.dispatchEvent(new PointerEvent(type, {bubbles: true, pointerId: 1, button: 0, buttons, clientX: r.left + x * r.width, clientY: r.top + r.height / 2}))
            }
            const g = globalThis as unknown as WindowGlobals
            const before = g.shared.getRange()
            g.shared.setLive(true)
            fire("pointerdown", 0.3, 1)
            fire("pointermove", 0.6, 1)
            fire("pointerup", 0.6, 0)
            const after = g.shared.getRange()
            const follows = g.lineB.getView()
            const wasLive = g.shared.isLive()
            document.querySelector("#tw-line-a svg")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true}))
            return {before: before.to - before.from, after: after.to - after.from, afterFrom: after.from, followsFrom: follows?.xMin, wasLive, out: g.shared.getRange().to - g.shared.getRange().from}
        })
        assertEquals(box.after > 0 && box.after < box.before, true)
        assertEquals(box.followsFrom, box.afterFrom)
        // A reader picking a range has stopped watching the latest
        assertEquals(box.wasLive, false)
        assertEquals(box.out, box.after * 2)
    })

    itWrap("a live window follows the clock, and its clock stops once nothing listens", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        type LiveGlobals = WindowGlobals & {lonelyTicks: {count: number}, listenToLonely: () => () => void, stopLonely: () => void}
        await page.evaluate(() => {
            const g = globalThis as unknown as LiveGlobals
            g.shared.setLast(3_600_000)
            g.shared.setLive(true)
            g.clock.now += 1000
            g.stopLonely = g.listenToLonely()
        })
        await waitFor(() => page.evaluate(() => {
            const g = globalThis as unknown as LiveGlobals
            // The clock moving is what makes each tick an announcement
            g.clock.now += 1000
            return g.lonelyTicks.count >= 2 && g.shared.getRange().to >= g.clock.now - 1000
        }))
        const span = await page.evaluate(() => {
            const g = globalThis as unknown as LiveGlobals
            g.stopLonely()
            return {span: g.shared.getRange().to - g.shared.getRange().from, ticks: g.lonelyTicks.count}
        })
        assertEquals(span.span, 3_600_000)
        await page.evaluate(() => {
            (globalThis as unknown as WindowGlobals).clock.now += 1000
        })
        await new Promise(resolve => setTimeout(resolve, 120))
        const after = await page.evaluate(() => (globalThis as unknown as LiveGlobals).lonelyTicks.count)
        assertEquals(after, span.ticks)
    })

    itWrap("a chart waiting on its first data loses its empty state when the data comes", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        const shownBefore = await page.evaluate(() => getComputedStyle(document.querySelector("#tw-from-empty .vtc-chart-empty") as HTMLElement).display)
        assertEquals(shownBefore, "flex")
        const after = await page.evaluate(() => {
            const g = globalThis as unknown as {fromEmpty: {update: (attrs: unknown) => void}}
            g.fromEmpty.update({data: [{x: Date.UTC(2026, 0, 1, 6), values: {v: 1}}, {x: Date.UTC(2026, 0, 1, 7), values: {v: 2}}]})
            return getComputedStyle(document.querySelector("#tw-from-empty .vtc-chart-empty") as HTMLElement).display
        })
        assertEquals(after, "none")
    })

    itWrap("moving the window puts away a tooltip reading the old range, and a live tick keeps it", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        await settleFrames()
        const hover = () => page.evaluate(() => {
            const svg = document.querySelector("#tw-line-a svg") as SVGElement
            const r = svg.getBoundingClientRect()
            svg.querySelector(".vtc-chart-hit")!.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2}))
        })
        const shown = (id: string) => page.evaluate((target: string) => document.querySelector(`#${target} .vtc-chart-tooltip`)!.classList.contains("vtc-chart-tooltip-visible"), {args: [id]})
        await hover()
        await settleFrames()
        assertEquals(await shown("tw-line-b"), true)
        await page.evaluate(() => {
            const g = globalThis as unknown as WindowGlobals
            const {from, to} = g.shared.getRange()
            g.shared.setRange(from - 60_000, to - 60_000)
        })
        await settleFrames()
        assertEquals(await shown("tw-line-b"), false)
        await page.evaluate(() => {
            (globalThis as unknown as WindowGlobals).shared.setLive(true)
        })
        await settleFrames()
        await hover()
        await settleFrames()
        await page.evaluate(() => {
            (globalThis as unknown as WindowGlobals).clock.now += 1000
        })
        // Past a tick and the drawing it caused
        await new Promise(resolve => setTimeout(resolve, 120))
        await settleFrames()
        assertEquals(await shown("tw-line-b"), true)
        const line = await page.evaluate(() => document.querySelectorAll('#tw-line-b line.vtc-chart-cursor[visibility="visible"]').length)
        assertEquals(line, 1)
    })

    itWrap("settled listeners hear about a burst of changes once", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        const before = await page.evaluate(() => {
            const g = globalThis as unknown as WindowGlobals & {changes: {all: number, settled: number}}
            const start = g.changes.all
            const {from, to} = g.shared.getRange()
            for (let i = 1; i <= 20; i++) {
                g.shared.setRange(from + i * 1000, to + i * 1000)
            }
            return {all: g.changes.all - start, settled: g.changes.settled}
        })
        assertEquals(before.all, 20)
        await new Promise(resolve => setTimeout(resolve, 350))
        const after = await page.evaluate(() => (globalThis as unknown as {changes: {settled: number}}).changes.settled)
        assertEquals(after - before.settled, 1)
    })

    itWrap("moving forward stops at now, and going back moves by a whole span", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const g = globalThis as unknown as WindowGlobals
            g.shared.setLast(3_600_000)
            const atNow = g.shared.getRange()
            g.shared.shift(1)
            const pushed = g.shared.getRange()
            g.shared.shift(-1)
            const back = g.shared.getRange()
            g.shared.zoomOut()
            return {now: g.clock.now, atNow, pushed, back, zoomed: g.shared.getRange()}
        })
        assertEquals(state.pushed, state.atNow)
        assertEquals(state.back.to, state.atNow.to - 3_600_000)
        assertEquals(state.zoomed.to - state.zoomed.from, 7_200_000)
    })

    itWrap("the control's list, buttons and fields drive the window, and it follows the window back", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(async () => {
            const g = globalThis as unknown as WindowGlobals
            const root = document.getElementById("tw-control") as HTMLElement
            const range = root.querySelector(".vtc-time-window-range") as HTMLButtonElement
            const text = () => root.querySelector(".vtc-time-window-range-text")!.textContent
            range.click()
            ;(root.querySelector('[data-span="900000"]') as HTMLButtonElement).click()
            const picked = g.shared.getRange()
            const shownPicked = text()
            const buttons = root.querySelectorAll(".vtd-button-group > .vtd-button")
            ;(buttons[0] as HTMLButtonElement).click()
            const backed = g.shared.getRange()
            const shownBacked = text()
            g.shared.setRange(Date.UTC(2026, 0, 1, 1, 0), Date.UTC(2026, 0, 1, 3, 0))
            const inputs = root.querySelectorAll('input[type="datetime-local"]') as NodeListOf<HTMLInputElement>
            const shown = [inputs[0].value, inputs[1].value]
            inputs[0].value = "2026-01-01T02:00"
            inputs[0].dispatchEvent(new Event("input"))
            const beforePause = g.shared.getRange().from
            await new Promise(resolve => setTimeout(resolve, 320))
            const typed = g.shared.getRange().from
            inputs[0].value = "2026-01-01T09:00"
            inputs[0].dispatchEvent(new Event("input"))
            await new Promise(resolve => setTimeout(resolve, 320))
            const backwards = g.shared.getRange().from
            const live = root.querySelector(".vtc-time-window-live") as HTMLButtonElement
            live.click()
            return {pickedSpan: picked.to - picked.from, backedBy: backed.to - picked.to, shownPicked, shownBacked, title: range.title, shown, beforePause, typed, backwards, pressed: live.getAttribute("aria-pressed"), isLive: g.shared.isLive()}
        })
        assertEquals(state.pickedSpan, 900_000)
        assertEquals(state.backedBy, -900_000)
        assertEquals(state.shownPicked, new Intl.NumberFormat(undefined, {style: "unit", unit: "minute", unitDisplay: "short"}).format(15))
        // Moved off now, it says which fifteen minutes rather than only how long
        assertEquals(state.shownBacked !== state.shownPicked, true)
        assertEquals(state.title.includes("–"), true)
        assertEquals(state.shown, ["2026-01-01T01:00", "2026-01-01T03:00"])
        assertEquals(state.beforePause, Date.UTC(2026, 0, 1, 1, 0))
        assertEquals(state.typed, Date.UTC(2026, 0, 1, 2, 0))
        // Back to front waits for the reader to finish
        assertEquals(state.backwards, state.typed)
        assertEquals(state.pressed, "true")
        assertEquals(state.isLive, true)
    })

    itWrap("the range opens on click and closes on Escape, an outside press, a pick or moving on", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("tw-control") as HTMLElement
            const range = root.querySelector(".vtc-time-window-range") as HTMLButtonElement
            const popover = root.querySelector(".vtd-popover-content") as HTMLElement
            const filter = root.querySelector(".vtc-time-window-filter") as HTMLInputElement
            const shut = () => !popover.classList.contains("vtd-popover-open")
            const result: Record<string, unknown> = {startsShut: shut(), hiddenTakesNoRoom: popover.getBoundingClientRect().height}
            range.click()
            result.opened = !shut()
            result.expanded = range.getAttribute("aria-expanded")
            result.focusInFilter = document.activeElement === filter
            range.focus()
            range.click()
            range.click()
            filter.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
            result.escape = shut()
            result.focusBack = document.activeElement === range
            range.click()
            document.body.click()
            result.outside = shut()
            range.click()
            ;(root.querySelector('[data-span="3600000"]') as HTMLButtonElement).click()
            result.pick = shut()
            result.focusAfterPick = document.activeElement === range
            range.click()
            const after = document.createElement("button")
            document.body.appendChild(after)
            after.focus()
            result.movedOn = shut()
            after.remove()
            range.click()
            range.click()
            result.toggled = shut()
            return result
        })
        assertEquals(state, {startsShut: true, hiddenTakesNoRoom: 0, opened: true, expanded: "true", focusInFilter: true, escape: true, focusBack: true, outside: true, pick: true, focusAfterPick: true, movedOn: true, toggled: true})
    })

    itWrap("a range can be typed as a number and a unit, and the list narrows to what is typed", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const g = globalThis as unknown as WindowGlobals
            const root = document.getElementById("tw-control") as HTMLElement
            const range = root.querySelector(".vtc-time-window-range") as HTMLButtonElement
            const filter = root.querySelector(".vtc-time-window-filter") as HTMLInputElement
            const type = (text: string) => {
                filter.value = text
                filter.dispatchEvent(new Event("input"))
            }
            const enter = () => filter.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
            const span = () => g.shared.getRange().to - g.shared.getRange().from
            const shown = () => Array.from(root.querySelectorAll(".vtc-time-window-list .vtd-button")).filter(b => !(b as HTMLElement).hidden).map(b => b.textContent)
            const spans: Record<string, number> = {}
            for (const text of ["13h", "now-30m", "500ms", "2 d", "1w", "1M", "1m"]) {
                range.click()
                type(text)
                enter()
                spans[text] = span()
            }
            range.click()
            type("13h")
            const offered = shown()
            enter()
            const label = root.querySelector(".vtc-time-window-range-text")!.textContent
            range.click()
            type("13h")
            type("hr")
            const narrowed = shown()
            const before = span()
            type("nonsense")
            enter()
            return {spans, offered, label, narrowed, invalid: filter.getAttribute("aria-invalid"), stillOpen: root.querySelector(".vtd-popover-content")!.classList.contains("vtd-popover-open"), unchanged: span() === before}
        })
        assertEquals(state.spans, {"13h": 46_800_000, "now-30m": 1_800_000, "500ms": 500, "2 d": 172_800_000, "1w": 604_800_000, "1M": 2_592_000_000, "1m": 60_000})
        assertEquals(state.offered, [new Intl.NumberFormat(undefined, {style: "unit", unit: "hour", unitDisplay: "short"}).format(13)])
        // A typed length reads as that length, not as the two times it happens to fall between
        assertEquals(state.label, state.offered[0])
        assertEquals(state.narrowed, ["1 hr", "6 hr", "12 hr"])
        assertEquals(state.invalid, "true")
        assertEquals(state.stillOpen, true)
        assertEquals(state.unchanged, true)
    })

    itWrap("the arrow keys walk from the box down the list and back", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("tw-control") as HTMLElement
            const filter = root.querySelector(".vtc-time-window-filter") as HTMLInputElement
            const press = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true}))
            ;(root.querySelector(".vtc-time-window-range") as HTMLButtonElement).click()
            press("ArrowDown")
            const first = (document.activeElement as HTMLElement).dataset.span
            press("ArrowDown")
            const second = (document.activeElement as HTMLElement).dataset.span
            press("ArrowUp")
            press("ArrowUp")
            return {first, second, back: document.activeElement === filter}
        })
        assertEquals(state, {first: "300000", second: "900000", back: true})
    })

    itWrap("the control is compact, and what opens from it stays on the page", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("tw-control") as HTMLElement
            const range = root.querySelector(".vtc-time-window-range") as HTMLButtonElement
            const popover = root.querySelector(".vtd-popover-content") as HTMLElement
            const height = root.getBoundingClientRect().height
            // Pushed to the right edge of the page, the popover has to slide back
            root.style.marginInlineStart = `${document.documentElement.clientWidth - range.getBoundingClientRect().right - 60}px`
            range.click()
            const box = popover.getBoundingClientRect()
            return {height, right: box.right, left: box.left, width: document.documentElement.clientWidth}
        })
        assertEquals(state.height <= 36, true)
        assertEquals(state.right <= state.width, true)
        assertEquals(state.left >= 0, true)
    })

    itWrap("a double click selects no text on a chart", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        await settleFrames()
        const spots = await page.evaluate(() => {
            const svg = document.querySelector("#tw-line-a svg") as SVGElement
            const label = Array.from(svg.querySelectorAll("text")).find(text => (text.textContent ?? "").length > 0) as SVGTextElement
            const at = label.getBoundingClientRect()
            const whole = svg.getBoundingClientRect()
            return [{x: at.left + at.width / 2, y: at.top + at.height / 2}, {x: whole.left + whole.width / 2, y: whole.top + whole.height / 2}]
        })
        for (const spot of spots) {
            await page.mouse.click(spot.x, spot.y, {count: 2})
            const selected = await page.evaluate(() => getSelection()?.toString() ?? "")
            assertEquals(selected, "")
        }
    })

    itWrap("the hover cursor stands out from the grid, so a tick under it can't hide it", "time-window", "#tw-line-a svg", async (_selection: ElementHandle) => {
        await settleFrames()
        const stroke = await page.evaluate(() => {
            const svg = document.querySelector("#tw-line-a svg") as SVGElement
            const cursor = svg.querySelector("line.vtc-chart-cursor")
            const grid = svg.querySelector("line.vtc-chart-gridline")
            return {cursor: cursor ? getComputedStyle(cursor).stroke : null, grid: grid ? getComputedStyle(grid).stroke : null}
        })
        assertEquals(stroke.cursor !== null, true)
        assertEquals(stroke.cursor !== stroke.grid, true)
    })

    itWrap("a time axis and its tooltip read down to the millisecond", "time-window", "#tw-fine svg", async (_selection: ElementHandle) => {
        await settleFrames()
        const state = await page.evaluate(() => {
            const svg = document.querySelector("#tw-fine svg") as SVGElement
            const ticks = Array.from(svg.querySelectorAll("text")).map(text => text.textContent ?? "").filter(text => /\.\d{3}/.test(text))
            const r = svg.getBoundingClientRect()
            svg.querySelector(".vtc-chart-hit")!.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2}))
            const inside = Array.from(svg.querySelectorAll("text")).every(text => text.getBoundingClientRect().right <= r.right + 1 && text.getBoundingClientRect().left >= r.left - 1)
            const narrow = document.querySelector("#tw-narrow-fine svg") as SVGElement
            const boxes = Array.from(narrow.querySelectorAll("text")).filter(text => /:/.test(text.textContent ?? "")).map(text => text.getBoundingClientRect()).sort((a, b) => a.left - b.left)
            const apart = boxes.every((box, i) => i === 0 || box.left >= boxes[i - 1].right)
            return {ticks, inside, apart, title: document.querySelector("#tw-fine .vtc-chart-tooltip-title")?.textContent ?? ""}
        })
        assertEquals(state.ticks.length > 1, true)
        assertEquals(state.inside, true)
        assertEquals(state.apart, true)
        // Spaced under a second, they would read as one time over and over without their milliseconds
        assertEquals(new Set(state.ticks).size, state.ticks.length)
        assertEquals(/\.\d{3}/.test(state.title), true)
    })

    itWrap("the control's fields hold a range to the millisecond, and an end left alone stays exact", "time-window", "#tw-fine-control .vtc-time-window-end input", async (_selection: ElementHandle) => {
        const state = await page.evaluate(async () => {
            const g = globalThis as unknown as {fineWindow: {getRange: () => {from: number, to: number}, setRange: (from: number, to: number) => void}}
            const inputs = document.querySelectorAll('#tw-fine-control input[type="datetime-local"]') as NodeListOf<HTMLInputElement>
            const shown = inputs[0].value
            const step = inputs[0].step
            const toBefore = g.fineWindow.getRange().to
            inputs[0].value = "2026-01-01T00:00:01.250"
            inputs[0].dispatchEvent(new Event("input"))
            await new Promise(resolve => setTimeout(resolve, 320))
            const typed = g.fineWindow.getRange()
            const coarse = g.fineWindow as unknown as {setRange: (from: number, to: number) => void}
            coarse.setRange(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 1, 6, 0, 12, 345))
            const wide = [inputs[0].value, inputs[1].value, inputs[0].step]
            inputs[0].value = "2026-01-01T01:00"
            inputs[0].dispatchEvent(new Event("input"))
            await new Promise(resolve => setTimeout(resolve, 320))
            const always = (document.querySelector('#tw-always input[type="datetime-local"]') as HTMLInputElement)
            return {shown, step, toBefore, typed, wide, keptTo: g.fineWindow.getRange().to, always: [always.step, always.value]}
        })
        assertEquals(state.shown, "2026-01-01T00:00:01.123")
        assertEquals(state.step, "0.001")
        assertEquals(state.typed, {from: Date.UTC(2026, 0, 1, 0, 0, 1, 250), to: state.toBefore})
        // A wide range shows whole minutes, and typing the other end doesn't round this one
        assertEquals(state.wide, ["2026-01-01T00:00", "2026-01-01T06:00", "60"])
        assertEquals(state.keptTo, Date.UTC(2026, 0, 1, 6, 0, 12, 345))
        assertEquals(state.always[0], "0.001")
        // A field's value leaves out zero seconds. The step is what makes it show them
        assertEquals(state.always[1], "2026-01-01T00:00")
    })

    itWrap("a ring on the live button runs to the window's next move, and the interval is written beside it", "time-window", "#tw-beating button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("tw-beating") as HTMLElement
            const live = root.querySelector(".vtc-time-window-live") as HTMLButtonElement
            const circle = root.querySelector(".vtc-time-window-ring circle") as SVGElement
            const running = circle.getAnimations()[0]
            const g = globalThis as unknown as {beating: {getNextTick: () => number | undefined, setLive: (live: boolean) => void, setLast: (span: number) => void}}
            // A change that isn't a tick leaves the ring where it is
            g.beating.setLast(1_800_000)
            const sameAfterChange = circle.getAnimations()[0] === running
            const timing = running.effect?.getComputedTiming()
            const next = g.beating.getNextTick()
            const every = (root.querySelector(".vtc-time-window-every") as HTMLElement)
            const shownLive = getComputedStyle(every).display
            const name = live.getAttribute("aria-label")
            g.beating.setLive(false)
            const stopped = {animations: circle.getAnimations().length, ring: getComputedStyle(root.querySelector(".vtc-time-window-ring")!).visibility, every: getComputedStyle(every).display, next: g.beating.getNextTick() ?? null, name: live.getAttribute("aria-label")}
            return {sameAfterChange, duration: timing?.duration, nextOk: typeof next === "number" && next > Date.now(), text: every.textContent, shownLive, name, stopped, expected: new Intl.NumberFormat(undefined, {style: "unit", unit: "second", unitDisplay: "short"}).format(10)}
        })
        assertEquals(state.sameAfterChange, true)
        assertEquals(state.duration, 10_000)
        assertEquals(state.nextOk, true)
        assertEquals(state.text, state.expected)
        assertEquals(state.shownLive !== "none", true)
        assertEquals(state.name, `live-name, ${state.expected}`)
        assertEquals(state.stopped, {animations: 0, ring: "hidden", every: "none", next: null, name: "live-name"})
    })

    itWrap("the ring starts over at each move of the window", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(async () => {
            const g = globalThis as unknown as WindowGlobals
            const circle = document.querySelector("#tw-control .vtc-time-window-ring circle") as SVGElement
            g.shared.setLive(true)
            const first = circle.getAnimations()[0]
            g.clock.now += 1000
            await new Promise(resolve => setTimeout(resolve, 150))
            const second = circle.getAnimations()[0]
            return {first: first !== undefined, restarted: first !== second, count: circle.getAnimations().length}
        })
        assertEquals(state, {first: true, restarted: true, count: 1})
    })

    itWrap("with reduced motion asked for, the ring stands full rather than moving", "time-window", "#tw-beating button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const real = globalThis.matchMedia
            globalThis.matchMedia = ((query: string) => /reduced-motion/.test(query) ? {matches: true} : real(query)) as typeof matchMedia
            const g = globalThis as unknown as {beating: {setLive: (live: boolean) => void}}
            const circle = document.querySelector("#tw-beating .vtc-time-window-ring circle") as SVGElement
            g.beating.setLive(false)
            g.beating.setLive(true)
            const result = {animations: circle.getAnimations().length, offset: getComputedStyle(circle).strokeDashoffset, ring: getComputedStyle(circle.parentElement as unknown as Element).visibility}
            globalThis.matchMedia = real
            return result
        })
        assertEquals(state.animations, 0)
        assertEquals(state.ring, "visible")
        assertEquals(parseFloat(state.offset), 0)
    })

    itWrap("a range goes out as text and comes back, whichever form it is in", "time-window", "#tw-linked button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const g = globalThis as unknown as {linked: {toText: () => string, setFromText: (text: string) => boolean, setLast: (span: number) => void, setRange: (from: number, to: number) => void, setLive: (live: boolean) => void, getRange: () => {from: number, to: number}, isLive: () => boolean, isRelative: () => boolean, shift: (direction: number) => void, zoomOut: () => void}}
            const w = g.linked
            const texts: string[] = []
            w.setLast(21_600_000)
            texts.push(w.toText())
            w.setLive(true)
            texts.push(w.toText())
            w.setLast(90_000)
            texts.push(w.toText())
            w.setLive(false)
            w.setLast(1500)
            texts.push(w.toText())
            w.setRange(Date.UTC(2026, 0, 1, 1), Date.UTC(2026, 0, 1, 2, 0, 0, 5))
            texts.push(w.toText())
            const fixed = w.toText()
            const results: Record<string, unknown> = {}
            w.setLast(3_600_000)
            results.fixedBack = [w.setFromText(fixed), w.getRange(), w.isRelative(), w.isLive()]
            results.live = [w.setFromText("live-2h"), w.getRange().to - w.getRange().from, w.isRelative(), w.isLive()]
            results.now = [w.setFromText("now-2h"), w.isRelative(), w.isLive()]
            results.url = [w.setFromText(`https://dash.example/board/7?theme=dark&time=${fixed}#panel`), w.getRange().from]
            results.urlEncoded = [w.setFromText(`https://dash.example/?other=1&window=${encodeURIComponent("now-15m")}`), w.getRange().to - w.getRange().from]
            results.bad = ["", "nonsense", "12", "5 lightyears", "2026-01-02/2026-01-01", "1/2", "1/2/2026", "https://dash.example/?a=b", "https://["].map(text => w.setFromText(text))
            w.setRange(Date.UTC(2026, 0, 1, 1), Date.UTC(2026, 0, 1, 2))
            w.shift(-1)
            results.shifted = w.isRelative()
            w.setLast(3_600_000)
            w.zoomOut()
            results.zoomedRelative = [w.isRelative(), w.getRange().to - w.getRange().from]
            return {texts, results}
        })
        assertEquals(state.texts, ["now-6h", "live-6h", "live-90s", "now-1500ms", "2026-01-01T01:00:00.000Z/2026-01-01T02:00:00.005Z"])
        assertEquals(state.results.fixedBack, [true, {from: Date.UTC(2026, 0, 1, 1), to: Date.UTC(2026, 0, 1, 2, 0, 0, 5)}, false, false])
        assertEquals(state.results.live, [true, 7_200_000, true, true])
        assertEquals(state.results.now, [true, true, false])
        assertEquals(state.results.url, [true, Date.UTC(2026, 0, 1, 1)])
        assertEquals(state.results.urlEncoded, [true, 900_000])
        assertEquals(state.results.bad, [false, false, false, false, false, false, false, false, false])
        assertEquals(state.results.shifted, false)
        assertEquals(state.results.zoomedRelative, [true, 7_200_000])
    })

    it({name: "a page opens on the range in its address, and keeps the rest of the address", ignore: selectedModules !== undefined && !selectedModules.has("time-window"), fn: async () => {
        const fixed = "2026-01-01T01:00:00.000Z/2026-01-01T02:00:00.000Z"
        await page.goto(`${baseUrl}/time-window?theme=dark&time=${fixed}#panel`, {waitUntil: "load"})
        await page.waitForSelector("#tw-linked button")
        const opened = await page.evaluate(() => {
            const g = globalThis as unknown as {linked: {getRange: () => {from: number, to: number}, setFromText: (text: string) => boolean, setRange: (from: number, to: number) => void}, linkedMoves: {writes: number}}
            return {range: g.linked.getRange(), writes: g.linkedMoves.writes, shown: document.querySelector("#tw-linked .vtc-time-window-range-text")?.textContent !== ""}
        })
        assertEquals(opened.range, {from: Date.UTC(2026, 0, 1, 1), to: Date.UTC(2026, 0, 1, 2)})
        // Opening on a range is no reason to rewrite the address
        assertEquals(opened.writes, 0)

        await page.evaluate(() => {
            const g = globalThis as unknown as {linked: {setRange: (from: number, to: number) => void}}
            for (let i = 1; i <= 20; i++) {
                g.linked.setRange(Date.UTC(2026, 0, 2, 1) + i, Date.UTC(2026, 0, 2, 2) + i)
            }
        })
        await new Promise(resolve => setTimeout(resolve, 350))
        const written = await page.evaluate(() => ({search: location.search, hash: location.hash, writes: (globalThis as unknown as {linkedMoves: {writes: number}}).linkedMoves.writes, read: new URLSearchParams(location.search).get("time")}))
        assertEquals(written.search, "?theme=dark&time=2026-01-02T01:00:00.020Z/2026-01-02T02:00:00.020Z")
        assertEquals(written.hash, "#panel")
        assertEquals(written.read, "2026-01-02T01:00:00.020Z/2026-01-02T02:00:00.020Z")
        // A burst of moves is one change of address
        assertEquals(written.writes, 1)

        await page.evaluate(() => (globalThis as unknown as {linked: {setFromText: (text: string) => boolean}}).linked.setFromText("live-30m"))
        await new Promise(resolve => setTimeout(resolve, 350))
        assertEquals(await page.evaluate(() => location.search), "?theme=dark&time=live-30m")

        // Back or forward to an address saying something else moves the window there
        const back = await page.evaluate(() => {
            const g = globalThis as unknown as {linked: {getRange: () => {from: number, to: number}, isLive: () => boolean, setLive: (live: boolean) => void}}
            g.linked.setLive(false)
            history.pushState(null, "", `${location.pathname}?time=now-5m`)
            dispatchEvent(new PopStateEvent("popstate"))
            const r = g.linked.getRange()
            return r.to - r.from
        })
        assertEquals(back, 300_000)

        // Nonsense in an address is ignored rather than breaking the page
        await page.goto(`${baseUrl}/time-window?time=nonsense`, {waitUntil: "load"})
        await page.waitForSelector("#tw-linked button")
        const ignored = await page.evaluate(() => {
            const g = globalThis as unknown as {linked: {getRange: () => {from: number, to: number}}}
            return g.linked.getRange().to - g.linked.getRange().from
        })
        assertEquals(ignored, 3_600_000)
    }})

    itWrap("the copy and paste buttons use the clipboard, and fall back on the box when they can't", "time-window", "#tw-linked button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(async () => {
            const g = globalThis as unknown as {linked: {getRange: () => {from: number, to: number}, setLast: (span: number) => void, setRange: (from: number, to: number) => void}}
            const root = document.getElementById("tw-linked") as HTMLElement
            const range = root.querySelector(".vtc-time-window-range") as HTMLButtonElement
            const filter = root.querySelector(".vtc-time-window-filter") as HTMLInputElement
            const popover = root.querySelector(".vtd-popover-content") as HTMLElement
            const copy = root.querySelector('[aria-label="copy-name"]') as HTMLButtonElement
            const paste = root.querySelector('[aria-label="paste-name"]') as HTMLButtonElement
            const tick = () => new Promise(resolve => setTimeout(resolve, 10))
            let clipboard = ""
            const fake = {writeText: (text: string) => {clipboard = text; return Promise.resolve()}, readText: () => Promise.resolve(clipboard)}
            Object.defineProperty(navigator, "clipboard", {configurable: true, value: fake})
            const out: Record<string, unknown> = {}

            g.linked.setRange(Date.UTC(2026, 0, 1, 1), Date.UTC(2026, 0, 1, 2))
            range.click()
            const iconBefore = copy.innerHTML.length
            copy.click()
            await tick()
            out.copied = clipboard
            out.copyStaysOpen = !!popover.classList.contains("vtd-popover-open")
            out.iconChanged = copy.innerHTML.length !== iconBefore

            g.linked.setLast(3_600_000)
            paste.click()
            await tick()
            out.pasted = g.linked.getRange()
            out.pasteCloses = !popover.classList.contains("vtd-popover-open")

            // Something on the clipboard that isn't a range
            clipboard = "a shopping list"
            range.click()
            paste.click()
            await tick()
            out.badPaste = [filter.getAttribute("aria-invalid"), !!popover.classList.contains("vtd-popover-open"), filter.value]

            // The browser refusing: paste goes to the box, and copy leaves the text selected there
            fake.readText = () => Promise.reject(new Error("denied"))
            fake.writeText = () => Promise.reject(new Error("denied"))
            filter.value = ""
            ;(document.activeElement as HTMLElement)?.blur()
            paste.click()
            await tick()
            out.refusedPaste = document.activeElement === filter
            g.linked.setRange(Date.UTC(2026, 0, 3), Date.UTC(2026, 0, 4))
            copy.click()
            await tick()
            out.refusedCopy = [filter.value, filter.selectionStart, filter.selectionEnd === filter.value.length, document.activeElement === filter]

            // Pasting straight into the box applies a whole range, and leaves anything else as typing
            const pasteIn = (text: string) => {
                const data = new DataTransfer()
                data.setData("text", text)
                const event = new ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true})
                filter.dispatchEvent(event)
                return event.defaultPrevented
            }
            out.pasteOther = [pasteIn("hello"), !!popover.classList.contains("vtd-popover-open")]
            out.pasteRange = [pasteIn("https://dash.example/board?time=now-20m"), !popover.classList.contains("vtd-popover-open"), g.linked.getRange().to - g.linked.getRange().from]
            delete (navigator as unknown as {clipboard?: unknown}).clipboard
            return out
        })
        assertEquals(state.copied, "2026-01-01T01:00:00.000Z/2026-01-01T02:00:00.000Z")
        assertEquals(state.copyStaysOpen, true)
        assertEquals(state.iconChanged, true)
        assertEquals(state.pasted, {from: Date.UTC(2026, 0, 1, 1), to: Date.UTC(2026, 0, 1, 2)})
        assertEquals(state.pasteCloses, true)
        assertEquals(state.badPaste, ["true", true, "a shopping list"])
        assertEquals(state.refusedPaste, true)
        assertEquals(state.refusedCopy, ["2026-01-03T00:00:00.000Z/2026-01-04T00:00:00.000Z", 0, true, true])
        assertEquals(state.pasteOther, [false, true])
        assertEquals(state.pasteRange, [true, true, 1_200_000])
    })

    itWrap("flush right, what opens from the range opens leftward, under it", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        await page.setViewportSize({width: 1000, height: 400})
        try {
            const state = await page.evaluate(() => {
                const root = document.getElementById("tw-control") as HTMLElement
                const control = root.querySelector(".vtc-time-window") as HTMLElement
                const range = root.querySelector(".vtc-time-window-range") as HTMLButtonElement
                const popover = root.querySelector(".vtd-popover-content") as HTMLElement
                const open = () => {
                    range.click()
                    const box = popover.getBoundingClientRect()
                    const anchor = root.querySelector(".vtd-popover")!.getBoundingClientRect()
                    range.click()
                    return {left: box.left - anchor.left, right: box.right - anchor.right, onPage: box.left >= 0 && box.right <= document.documentElement.clientWidth}
                }
                const onLeft = open()
                control.style.justifyContent = "flex-end"
                return {onLeft, onRight: open()}
            })
            // Up against the page's left edge, it keeps its small margin from that edge
            assertEquals(state.onLeft.left >= 0 && state.onLeft.left <= 8, true)
            assertEquals(state.onLeft.onPage, true)
            assertEquals(Math.abs(state.onRight.right) < 1, true)
            assertEquals(state.onRight.onPage, true)
        } finally {
            await page.setViewportSize({width: 400, height: 200})
        }
    })

    itWrap("which way it opens can be chosen, and either way it stays on the page", "time-window", "#tw-opens-leftward button", async (_selection: ElementHandle) => {
        await page.setViewportSize({width: 1000, height: 400})
        try {
            const state = await page.evaluate(() => {
                const open = (id: string, place: (control: HTMLElement) => void) => {
                    const root = document.getElementById(id) as HTMLElement
                    const control = root.querySelector(".vtc-time-window") as HTMLElement
                    const range = root.querySelector(".vtc-time-window-range") as HTMLButtonElement
                    const popover = root.querySelector(".vtd-popover-content") as HTMLElement
                    place(control)
                    range.click()
                    const box = popover.getBoundingClientRect()
                    const anchor = root.querySelector(".vtd-popover")!.getBoundingClientRect()
                    range.click()
                    return {left: box.left - anchor.left, right: box.right - anchor.right, onPage: box.left >= 0 && box.right <= document.documentElement.clientWidth}
                }
                const leftOfMiddle = (control: HTMLElement) => {
                    control.style.marginInlineStart = "440px"
                }
                const rightOfMiddle = (control: HTMLElement) => {
                    control.style.marginInlineStart = "500px"
                }
                return {
                    // Each against what auto would have done there
                    leftward: open("tw-opens-leftward", leftOfMiddle),
                    rightward: open("tw-opens-rightward", rightOfMiddle),
                    // Asked to run off the page, it slides back on
                    rightwardAtEdge: open("tw-opens-rightward", control => {
                        control.style.marginInlineStart = "800px"
                    }),
                    leftwardAtEdge: open("tw-opens-leftward", control => {
                        control.style.marginInlineStart = "0"
                    }),
                }
            })
            assertEquals(Math.abs(state.leftward.right) < 1, true)
            assertEquals(Math.abs(state.rightward.left) < 1, true)
            assertEquals(state.rightwardAtEdge.onPage, true)
            assertEquals(state.leftwardAtEdge.onPage, true)
        } finally {
            await page.setViewportSize({width: 400, height: 200})
        }
    })

    itWrap("on a short screen, what opens from the range scrolls rather than running off the bottom", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        await page.setViewportSize({width: 400, height: 220})
        try {
            const state = await page.evaluate(() => {
                const root = document.getElementById("tw-control") as HTMLElement
                const popover = root.querySelector(".vtd-popover-content") as HTMLElement
                // Pinned near the top, as a bar that stays put is, so there is a known amount of room below it
                root.style.cssText = "position:fixed;top:40px;left:0;width:100%;"
                ;(root.querySelector(".vtc-time-window-range") as HTMLButtonElement).click()
                return {bottom: popover.getBoundingClientRect().bottom, height: innerHeight, scrolls: popover.scrollHeight > popover.clientHeight}
            })
            assertEquals(state.bottom <= state.height, true)
            assertEquals(state.scrolls, true)
        } finally {
            await page.setViewportSize({width: 400, height: 200})
        }
    })

    itWrap("what opens from the range stays on the page as the page changes under it", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        const read = () => page.evaluate(() => {
            const popover = document.querySelector("#tw-control .vtd-popover-content") as HTMLElement
            const box = popover.getBoundingClientRect()
            return {left: box.left, right: box.right, bottom: box.bottom, width: document.documentElement.clientWidth, height: innerHeight, slide: popover.style.translate, shut: !popover.classList.contains("vtd-popover-open")}
        })
        const settle = async () => {
            await new Promise(resolve => setTimeout(resolve, 100))
            await settleFrames()
        }
        await page.setViewportSize({width: 1000, height: 500})
        try {
            await page.evaluate(() => {
                const root = document.getElementById("tw-control") as HTMLElement
                root.style.cssText = "position:fixed;top:40px;left:0;width:100%;"
                ;(root.querySelector(".vtc-time-window") as HTMLElement).style.justifyContent = "flex-end"
                ;(root.querySelector(".vtc-time-window-range") as HTMLButtonElement).click()
            })
            await settle()
            const wide = await read()
            assertEquals(wide.shut, false)

            await page.setViewportSize({width: 600, height: 500})
            await settle()
            const narrower = await read()
            assertEquals(narrower.left >= 0 && narrower.right <= narrower.width, true)

            await page.setViewportSize({width: 340, height: 500})
            await settle()
            const narrowest = await read()
            assertEquals(narrowest.left >= 0 && narrowest.right <= narrowest.width, true)

            await page.setViewportSize({width: 1000, height: 260})
            await settle()
            const short = await read()
            assertEquals(short.left >= 0 && short.right <= short.width, true)
            assertEquals(short.bottom <= short.height, true)

            // Shut, it listens to nothing
            await page.evaluate(() => {
                (document.querySelector("#tw-control .vtc-time-window-range") as HTMLButtonElement).click()
            })
            const before = (await read()).slide
            await page.setViewportSize({width: 500, height: 400})
            await settle()
            assertEquals((await read()).slide, before)
        } finally {
            await page.setViewportSize({width: 400, height: 200})
        }
    })

    itWrap("the control wraps to fit a narrow page", "time-window", "#tw-control button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const host = document.getElementById("tw-control") as HTMLElement
            host.style.width = "320px"
            const parts = Array.from(host.querySelectorAll("button,select,input"))
            const right = host.getBoundingClientRect().right
            return parts.every(part => part.getBoundingClientRect().right <= right + 1)
        })
        assertEquals(state, true)
    })

    itWrap("the control assumes no language: names and preset words come from the consumer or the browser", "time-window", "#tw-labelled button", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const named = document.getElementById("tw-labelled") as HTMLElement
            const plain = document.getElementById("tw-utc") as HTMLElement
            const range = named.querySelector(".vtc-time-window-range") as HTMLButtonElement
            return {
                names: Array.from(named.querySelectorAll("button:not(.vtc-time-window-list .vtd-button),input")).map(el => el.getAttribute("aria-label")),
                rangeName: range.getAttribute("aria-label"),
                options: Array.from(named.querySelectorAll(".vtc-time-window-list .vtd-button")).filter(o => !(o as HTMLElement).hidden).map(o => o.textContent),
                ends: Array.from(named.querySelectorAll(".vtc-time-window-end")).map(end => end.firstChild?.textContent),
                expected: new Intl.NumberFormat(undefined, {style: "unit", unit: "hour", unitDisplay: "short"}).format(2),
                plainNames: Array.from(plain.querySelectorAll("[aria-label]")).length,
                plainLive: plain.querySelector(".vtc-time-window-live") === null,
                plainEnds: Array.from(plain.querySelectorAll(".vtc-time-window-end")).map(end => end.textContent),
                zone: plain.querySelector(".vtc-time-window-zone")?.textContent,
            }
        })
        assertEquals(state.names, ["prev-name", "range-name: Une heure", "filter-name", "copy-name", "paste-name", "from-name", "to-name", "next-name", "out-name", "live-name"])
        assertEquals(state.options, ["Une heure", state.expected])
        assertEquals(state.ends, ["from-name", "to-name"])
        assertEquals(state.plainNames, 0)
        assertEquals(state.plainLive, true)
        assertEquals(state.plainEnds, ["", ""])
        assertEquals(state.zone, "UTC")
    })

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


    itWrap("a mixed chart draws bars and a line, with its own axis on the right", "features", "#mixed-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("mixed-chart") as HTMLElement
            return {
                bars: root.querySelectorAll("rect.vtc-chart-bar").length,
                lines: root.querySelectorAll("path.vtc-chart-line").length,
                right: Array.from(root.querySelectorAll("text.vtc-chart-tick-y2")).map(t => t.textContent),
                path: (root.querySelector("path.vtc-chart-line") as SVGPathElement).getAttribute("d") ?? "",
            }
        })
        assertEquals(state.bars, 4)
        assertEquals(state.lines, 1)
        if (!state.right.includes("20%")) {fail(`ERROR: expected the right axis in its own format, got ${JSON.stringify(state.right)}`)}
        if (!state.path.includes("C ")) {fail(`ERROR: expected a curve, got ${state.path}`)}
    })

    itWrap("a stepped line moves in right angles, and a smooth one never overshoots", "features", "#step-line", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const stepped = document.querySelector("#step-line path.vtc-chart-line")!.getAttribute("d") ?? ""
            const smooth = document.querySelector("#smooth-line path.vtc-chart-line") as SVGPathElement
            const axis = document.querySelector("#smooth-line line.vtc-chart-axis")!.getAttribute("y1")
            return {stepped, bottom: smooth.getBBox().y + smooth.getBBox().height, axis: Number(axis)}
        })
        if (!/H [\d.]+ V [\d.]+/.test(state.stepped)) {fail(`ERROR: expected horizontal then vertical moves, got ${state.stepped}`)}
        // Through 0, 0, 10: a curve that overshoots would dip below the zero line
        if (state.bottom > state.axis + 0.01) {fail(`ERROR: the smooth line overshoots: ${state.bottom} below ${state.axis}`)}
    })

    itWrap("the legend hides and shows a series, and keeps its buttons and focus", "features", "#toggle-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("toggle-chart") as HTMLElement
            const lines = () => root.querySelectorAll("path.vtc-chart-line").length
            const buttons = Array.from(root.querySelectorAll("button.vtc-chart-legend-item")) as HTMLButtonElement[]
            const seeded = {lines: lines(), pressed: buttons.map(b => b.getAttribute("aria-pressed"))}
            buttons[0].focus()
            buttons[0].click()
            const after = {
                lines: lines(),
                pressed: buttons[0].getAttribute("aria-pressed"),
                sameButton: root.querySelector("button.vtc-chart-legend-item") === buttons[0],
                focused: document.activeElement === buttons[0],
                rows: root.querySelectorAll(".vtc-chart-sr tbody tr td").length,
            }
            buttons[0].click()
            return {seeded, after, restored: lines()}
        })
        assertEquals(state.seeded, {lines: 2, pressed: ["true", "true", "false"]})
        // The hidden table keeps every series: hiding is a view of the data, not a change to it
        assertEquals(state.after, {lines: 1, pressed: "false", sameButton: true, focused: true, rows: 12})
        assertEquals(state.restored, 2)
    })

    itWrap("a pie's legend hides a slice and the rest fill the circle", "features", "#toggle-pie", async (_selection: ElementHandle) => {
        const arcs = await page.evaluate(() => {
            const root = document.getElementById("toggle-pie") as HTMLElement;
            (root.querySelector("button.vtc-chart-legend-item") as HTMLButtonElement).click()
            return root.querySelectorAll("path.vtc-chart-arc").length
        })
        assertEquals(arcs, 1)
    })

    itWrap("clicking a mark reports what was activated", "features", "#click-chart", async (_selection: ElementHandle) => {
        const detail = await page.evaluate(() => {
            (document.querySelector("#click-chart rect.vtc-chart-bar") as SVGRectElement).dispatchEvent(new MouseEvent("click", {bubbles: true}))
            return (globalThis as unknown as {lastClick: unknown}).lastClick
        })
        assertEquals(detail, {label: "up", index: 0, series: "v", value: 10})
    })

    itWrap("scatter and bubble place points by value, and size a bubble by area", "features", "#scatter-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const scatter = document.getElementById("scatter-chart") as HTMLElement
            const radii = Array.from(document.querySelectorAll("#bubble-chart circle.vtc-chart-point")).map(c => Number(c.getAttribute("r")))
            const hit = scatter.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const outlier = Array.from(scatter.querySelectorAll("circle.vtc-chart-point"))[2].getBoundingClientRect()
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: outlier.left + 2, clientY: outlier.top + 2}))
            return {
                points: scatter.querySelectorAll("circle.vtc-chart-point").length,
                legend: scatter.querySelectorAll(".vtc-chart-legend-item").length,
                radii,
                tip: (scatter.querySelector(".vtc-chart-tooltip") as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            }
        })
        assertEquals(state.points, 3)
        assertEquals(state.legend, 2)
        // Four times the size is four times the area, which is twice the radius
        if (Math.abs(state.radii[1] / state.radii[0] - 2) > 0.01) {fail(`ERROR: bubble radii should follow area: ${state.radii}`)}
        if (!state.tip.includes("Outlier")) {fail(`ERROR: expected the nearest point named, got ${JSON.stringify(state.tip)}`)}
    })

    itWrap("a radar draws a shape per series, a spoke per category and reads each by hover", "features", "#radar-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("radar-chart") as HTMLElement
            const sector = root.querySelector("path.vtc-chart-mark") as SVGPathElement
            sector.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
            return {
                shapes: root.querySelectorAll("path.vtc-chart-line").length,
                spokes: root.querySelectorAll("line.vtc-chart-spoke").length,
                labels: root.querySelectorAll("text.vtc-chart-spoke-label").length,
                tipRows: root.querySelectorAll(".vtc-chart-tooltip-row").length,
            }
        })
        assertEquals(state, {shapes: 2, spokes: 4, labels: 4, tipRows: 2})
    })

    itWrap("a polar area chart sizes each equal slice by its value", "features", "#polar-chart", async (_selection: ElementHandle) => {
        const widths = await page.evaluate(() => Array.from(document.querySelectorAll("#polar-chart path.vtc-chart-arc")).map(a => (a as SVGPathElement).getBBox()))
        assertEquals(widths.length, 3)
    })

    itWrap("animation runs only for the first drawing, and can be turned off", "features", "#still-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => ({
            animated: document.querySelector("#negative-bars svg")!.classList.contains("vtc-chart-enter"),
            still: document.querySelector("#still-chart svg")!.classList.contains("vtc-chart-enter"),
        }))
        assertEquals(state, {animated: true, still: false})
    })


    itWrap("annotations draw on the plot, and a threshold above the data brings the axis up to it", "features", "#annotated-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("annotated-chart") as HTMLElement
            const band = root.querySelector("rect.vtc-chart-annotation-band") as SVGRectElement
            return {
                labels: Array.from(root.querySelectorAll("text.vtc-chart-annotation-label")).map(t => t.textContent),
                lines: root.querySelectorAll("line.vtc-chart-annotation-line").length,
                points: root.querySelectorAll("circle.vtc-chart-annotation-point").length,
                bandWidth: Number(band.getAttribute("width")),
                ticks: Array.from(root.querySelectorAll("text.vtc-chart-tick-y")).map(t => t.textContent),
            }
        })
        assertEquals(state.labels.sort(), ["Peak", "Sale", "Target"])
        assertEquals(state.lines, 1)
        assertEquals(state.points, 1)
        if (state.bandWidth <= 0) {fail("ERROR: a band between two categories should have width")}
        if (!state.ticks.includes("500")) {fail(`ERROR: expected the axis to reach the threshold, got ${JSON.stringify(state.ticks)}`)}
    })

    itWrap("value labels use the format and sit either side of a bar", "features", "#values-chart", async (_selection: ElementHandle) => {
        const labels = await page.evaluate(() => Array.from(document.querySelectorAll("#values-chart text.vtc-chart-value-label")).map(t => t.textContent))
        assertEquals(labels, ["10u", "-5u"])
    })

    itWrap("error bars reach the given range, widen the axis and read in the tooltip", "features", "#errors-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("errors-chart") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.right - 5, clientY: box.top + 5}))
            return {
                bars: root.querySelectorAll("path.vtc-chart-error").length,
                ticks: Array.from(root.querySelectorAll("text.vtc-chart-tick-y")).map(t => Number(t.textContent)),
                tip: (root.querySelector(".vtc-chart-tooltip") as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            }
        })
        assertEquals(state.bars, 2)
        if (Math.max(...state.ticks) < 20) {fail(`ERROR: the axis must reach the top of the error bar, got ${state.ticks}`)}
        if (!state.tip.includes("-1") || !state.tip.includes("+8")) {fail(`ERROR: expected the range in the tooltip, got ${state.tip}`)}
    })

    itWrap("a linear trend runs through the fit, and a moving average starts once it has enough points", "features", "#trend-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const line = document.querySelector("#trend-chart path.vtc-chart-line")!.getAttribute("d") ?? ""
            const trend = document.querySelector("#trend-chart path.vtc-chart-trend")!.getAttribute("d") ?? ""
            const numbers = (d: string) => (d.match(/-?[\d.]+/g) ?? []).map(Number)
            const dots = document.querySelectorAll("#average-chart circle.vtc-chart-dot").length
            const average = numbers(document.querySelector("#average-chart path.vtc-chart-trend")!.getAttribute("d") ?? "")
            return {line: numbers(line), trend: numbers(trend), dots, averagePoints: average.length / 2}
        })
        // v = 2n is a perfect line, so its fit starts and ends exactly where the line does
        assertEquals(state.trend.map(Math.round), [state.line[0], state.line[1], state.line[6], state.line[7]].map(Math.round))
        assertEquals(state.averagePoints, state.dots - 1)
    })

    itWrap("a crosshair follows the pointer and reads both axes", "features", "#crosshair-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("crosshair-chart") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.left + 5, clientY: box.top + box.height / 2}))
            const shown = Array.from(root.querySelectorAll("line.vtc-chart-crosshair")).filter(l => l.getAttribute("visibility") === "visible").length
            const text = Array.from(root.querySelectorAll("text.vtc-chart-crosshair-text")).map(t => t.textContent)
            hit.parentElement!.parentElement!.dispatchEvent(new PointerEvent("pointerleave"))
            return {shown, text, left: Array.from(root.querySelectorAll("line.vtc-chart-crosshair")).filter(l => l.getAttribute("visibility") === "visible").length}
        })
        assertEquals(state.shown, 2)
        assertEquals(state.text[1], "Jan")
        if (!/\d/.test(state.text[0] ?? "")) {fail(`ERROR: expected a value on the y badge, got ${state.text[0]}`)}
        assertEquals(state.left, 0)
    })

    itWrap("charts in one sync group move their cursors together", "features", "#sync-one", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const one = document.getElementById("sync-one") as HTMLElement
            const two = document.getElementById("sync-two") as HTMLElement
            const unrelated = document.getElementById("crosshair-chart") as HTMLElement
            const hit = one.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.right - 5, clientY: box.top + 5}))
            const tip = two.querySelector(".vtc-chart-tooltip") as HTMLElement
            const during = {visible: tip.classList.contains("vtc-chart-tooltip-visible"), text: tip.innerText, other: unrelated.querySelector(".vtc-chart-tooltip")!.classList.contains("vtc-chart-tooltip-visible")}
            hit.parentElement!.parentElement!.dispatchEvent(new PointerEvent("pointerleave"))
            return {during, after: tip.classList.contains("vtc-chart-tooltip-visible")}
        })
        assertEquals(state.during.visible, true)
        assertEquals(state.during.other, false)
        if (!state.during.text.includes("Apr")) {fail(`ERROR: the second chart should show the same category, got ${state.during.text}`)}
        assertEquals(state.after, false)
    })


    /** The plot's rectangle in client coordinates, for placing a synthetic pointer */
    const settle = () => new Promise(resolve => setTimeout(resolve, 100))

    itWrap("ctrl and the wheel zoom around the pointer, a plain scroll passes through, and a double click resets", "features", "#zoom-chart", async (_selection: ElementHandle) => {
        const first = await page.evaluate(() => {
            const root = document.getElementById("zoom-chart") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            const wheel = (ctrlKey: boolean) => {
                const event = new WheelEvent("wheel", {bubbles: true, cancelable: true, clientX: box.left + box.width / 2, clientY: box.top + 10, deltaY: -600, ctrlKey})
                hit.dispatchEvent(event)
                return event.defaultPrevented
            }
            return {plain: wheel(false), withCtrl: wheel(true)}
        })
        assertEquals(first, {plain: false, withCtrl: true})
        await settle()
        const zoomed = await page.evaluate(() => {
            const root = document.getElementById("zoom-chart") as HTMLElement
            const chart = (globalThis as unknown as {zoomable: {getView: () => {xMin: number, xMax: number}}}).zoomable
            return {view: chart.getView(), clipped: root.querySelector("g.vtc-chart-plot")!.hasAttribute("clip-path"), dots: root.querySelectorAll("circle.vtc-chart-dot").length}
        })
        if (zoomed.view.xMax - zoomed.view.xMin >= 9) {fail(`ERROR: expected a tighter view, got ${JSON.stringify(zoomed.view)}`)}
        if (!zoomed.clipped) {fail("ERROR: a zoomed plot must cut its marks off at the edge")}
        if (zoomed.dots >= 10) {fail(`ERROR: only the rows in view should be drawn, got ${zoomed.dots}`)}
        await page.evaluate(() => document.querySelector("#zoom-chart .vtc-chart-drawing")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true})))
        await settle()
        const reset = await page.evaluate(() => (globalThis as unknown as {zoomable: {getView: () => unknown}}).zoomable.getView() === undefined)
        assertEquals(reset, true)
    })

    itWrap("dragging pans within the data, and zoom never runs past it", "features", "#zoom-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const chart = (globalThis as unknown as {zoomable: {zoomTo: (v: unknown) => void, getView: () => {xMin: number, xMax: number}}}).zoomable
            chart.zoomTo({xMin: 2, xMax: 5})
            return chart.getView()
        })
        assertEquals([state.xMin, state.xMax], [2, 5])
        await settle()
        const panned = await page.evaluate(() => {
            const root = document.getElementById("zoom-chart") as HTMLElement
            const chart = (globalThis as unknown as {zoomable: {getView: () => {xMin: number, xMax: number}}}).zoomable
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            const fire = (type: string, x: number) => hit.dispatchEvent(new PointerEvent(type, {bubbles: true, button: 0, clientX: x, clientY: box.top + 10, pointerId: 1}))
            fire("pointerdown", box.left + box.width / 2)
            fire("pointermove", box.left + box.width / 2 - box.width / 3)
            const once = chart.getView()
            // Far past the end of the data
            fire("pointermove", box.left - box.width * 10)
            const far = chart.getView()
            fire("pointerup", box.left)
            return {once, far}
        })
        if (panned.once.xMin <= 2) {fail(`ERROR: dragging left should move the view right, got ${JSON.stringify(panned.once)}`)}
        assertEquals(panned.far.xMax, 9.5)
        assertEquals(panned.far.xMax - panned.far.xMin, 3)
    })

    itWrap("a brush reports the range and points, without zooming unless asked", "features", "#brush-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("brush-chart") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            const fire = (type: string, x: number) => hit.dispatchEvent(new PointerEvent(type, {bubbles: true, button: 0, clientX: x, clientY: box.top + 10, pointerId: 1}))
            fire("pointerdown", box.left + box.width * 0.25)
            fire("pointermove", box.left + box.width * 0.52)
            const drawn = root.querySelectorAll("rect.vtc-chart-brush").length
            fire("pointerup", box.left + box.width * 0.52)
            const global = globalThis as unknown as {lastBrush: {xMin: number, xMax: number, points: {label: string}[]}, brushed: {getView: () => unknown}}
            return {
                drawn, gone: root.querySelectorAll("rect.vtc-chart-brush").length,
                labels: global.lastBrush.points.map(point => point.label),
                view: global.brushed.getView() ?? null,
            }
        })
        assertEquals(state.drawn, 1)
        assertEquals(state.gone, 0)
        assertEquals(state.labels, ["d2", "d3", "d4"])
        assertEquals(state.view, null)
    })

    itWrap("a range slider shows the whole of the data and its window sets the view", "features", "#slider-chart", async (_selection: ElementHandle) => {
        const before = await page.evaluate(() => {
            const root = document.getElementById("slider-chart") as HTMLElement
            const handle = root.querySelector("rect.vtc-chart-slider-handle-max") as SVGRectElement
            const box = handle.getBoundingClientRect()
            const svgBox = root.querySelector("svg")!.getBoundingClientRect()
            const plot = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const fire = (type: string, x: number) => handle.dispatchEvent(new PointerEvent(type, {bubbles: true, button: 0, clientX: x, clientY: box.top + 5, pointerId: 1}))
            fire("pointerdown", box.left + 3)
            fire("pointermove", box.left + 3 - plot.getBoundingClientRect().width / 2)
            fire("pointerup", box.left)
            return {
                view: (globalThis as unknown as {slid: {getView: () => {xMin: number, xMax: number}}}).slid.getView(),
                inside: box.bottom <= svgBox.bottom + 1,
            }
        })
        if (!before.inside) {fail("ERROR: the slider has to fit inside the chart's height")}
        if (before.view.xMax > 5 || before.view.xMax < 4) {fail(`ERROR: expected the window's end near the middle, got ${JSON.stringify(before.view)}`)}
    })

    itWrap("long lines thin to what the pixels show, keep their spike, and the tooltip still reads every point", "large", "#long-line", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const count = (id: string) => (document.querySelector(`#${id} path.vtc-chart-line`)!.getAttribute("d")!.match(/L /g) ?? []).length
            const root = document.getElementById("long-line") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + 5}))
            const peak = (id: string) => {
                const hitBox = document.querySelector(`#${id} rect.vtc-chart-hit`)!.getBoundingClientRect()
                return (document.querySelector(`#${id} path.vtc-chart-line`) as SVGPathElement).getBoundingClientRect().top - hitBox.top
            }
            return {
                lttb: count("long-line"), minMax: count("long-minmax"), whole: count("long-whole"),
                plotWidth: box.width,
                tip: (root.querySelector(".vtc-chart-tooltip-title") as HTMLElement).innerText,
                peaks: [peak("long-line"), peak("long-minmax")],
                tableRows: root.querySelectorAll(".vtc-chart-sr tbody tr").length,
            }
        })
        if (state.lttb > state.plotWidth * 2) {fail(`ERROR: expected at most two points per pixel, got ${state.lttb}`)}
        if (state.minMax > 200) {fail(`ERROR: expected the threshold honoured, got ${state.minMax}`)}
        assertEquals(state.whole, 1999)
        if (!/^\d+$/.test(state.tip.replace(/\D/g, ""))) {fail(`ERROR: expected a position in the tooltip, got ${state.tip}`)}
        // The one 40-high spike has to survive, so the line reaches near the top of the plot
        for (const peak of state.peaks) {
            if (peak > 30) {fail(`ERROR: a spike was lost in thinning: top of the line is ${peak}px down`)}
        }
        assertEquals(state.tableRows, 1000)
    })

    itWrap("appendData coalesces a burst into one drawing and drops old points", "features", "#stream-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const global = globalThis as unknown as {
                streaming: {appendData: (points: unknown[], options: unknown) => void}
                streamingData: unknown[]
            }
            const chart = global.streaming
            const root = document.getElementById("stream-chart") as HTMLElement
            const before = root.querySelector("svg")
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            for (let i = 1; i <= 50; i++) {
                chart.appendData([{x: i, values: {v: i}}], {maxPoints: 20})
                // A pointer between two frames finds the data changed and the layout not yet redrawn
                hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.left + 5, clientY: box.top + 5}))
            }
            return {sameSvgUntilNextFrame: root.querySelector("svg") === before, callersArray: global.streamingData.length}
        })
        assertEquals(state.sameSvgUntilNextFrame, true)
        // Dropping old points must not reach into the array the caller passed in
        assertEquals(state.callersArray, 1)
        await settle()
        const dots = await page.evaluate(() => document.querySelectorAll("#stream-chart circle.vtc-chart-dot").length)
        assertEquals(dots, 20)
    })

    itWrap("the canvas renderer paints the marks and leaves the axes and hover in the SVG", "large", "#canvas-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("canvas-chart") as HTMLElement
            const canvas = root.querySelector("canvas") as HTMLCanvasElement
            const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
            let painted = 0
            for (let i = 3; i < pixels.length; i += 4) {
                if (pixels[i] > 0) {painted++}
            }
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.left + 50, clientY: box.top + 5}))
            return {
                painted,
                lines: root.querySelectorAll("path.vtc-chart-line").length,
                ticks: root.querySelectorAll("text.vtc-chart-tick-y").length,
                tip: root.querySelector(".vtc-chart-tooltip")!.classList.contains("vtc-chart-tooltip-visible"),
            }
        })
        if (state.painted < 100) {fail(`ERROR: expected the line painted on the canvas, found ${state.painted} pixels`)}
        assertEquals(state.lines, 0)
        if (state.ticks < 2) {fail("ERROR: expected the axis to stay in the SVG")}
        assertEquals(state.tip, true)
    })

    itWrap("charts in a group zoom together", "features", "#synced-a", async (_selection: ElementHandle) => {
        const view = await page.evaluate(() => {
            const global = globalThis as unknown as {syncedA: {zoomTo: (v: unknown) => void}, syncedB: {getView: () => unknown}}
            global.syncedA.zoomTo({xMin: 1, xMax: 4})
            return global.syncedB.getView()
        })
        assertEquals(view, {xMin: 1, xMax: 4})
    })


    itWrap("a histogram counts values into its bins, with bars that touch", "more-charts", "#histogram-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("histogram-chart") as HTMLElement
            const bars = Array.from(root.querySelectorAll("rect.vtc-chart-bar")) as SVGRectElement[]
            const edges = bars.map(b => ({left: Number(b.getAttribute("x")), right: Number(b.getAttribute("x")) + Number(b.getAttribute("width"))}))
            return {
                counts: Array.from(root.querySelectorAll(".vtc-chart-sr tbody td")).map(c => c.textContent),
                first: root.querySelector(".vtc-chart-sr tbody th")!.textContent,
                gap: edges[1].left - edges[0].right,
                slot: edges[1].left - edges[0].left,
            }
        })
        // A value on an edge goes to the bin it starts, and the last bin takes its top edge too
        assertEquals(state.counts, ["2", "5", "2", "3", "2"])
        assertEquals(state.first, "0 - 2")
        if (state.gap > state.slot * 0.1) {fail(`ERROR: histogram bars should nearly touch, gap ${state.gap} of ${state.slot}`)}
    })

    itWrap("a waterfall hangs each step from the last and draws totals from zero", "more-charts", "#waterfall-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("waterfall-chart") as HTMLElement
            return (Array.from(root.querySelectorAll("rect.vtc-chart-bar")) as SVGRectElement[]).map(b => ({
                top: Number(b.getAttribute("y")), bottom: Number(b.getAttribute("y")) + Number(b.getAttribute("height")),
            }))
        })
        assertEquals(state.length, 4)
        // Sales starts where Start ended
        assertEquals(Math.round(state[1].bottom), Math.round(state[0].top))
        // Costs falls from where Sales ended
        assertEquals(Math.round(state[2].top), Math.round(state[1].top))
        // End reaches back to the baseline and up to where Costs finished
        assertEquals(Math.round(state[3].bottom), Math.round(state[0].bottom))
        assertEquals(Math.round(state[3].top), Math.round(state[2].bottom))
    })

    itWrap("a box plot summarizes raw values and draws an outlier by itself", "more-charts", "#boxplot-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("boxplot-chart") as HTMLElement
            return {
                boxes: root.querySelectorAll("rect.vtc-chart-bar").length,
                outliers: root.querySelectorAll("circle.vtc-chart-outlier").length,
                row: Array.from(root.querySelectorAll(".vtc-chart-sr tbody tr:first-child td")).map(c => c.textContent),
                ticks: Array.from(root.querySelectorAll("text.vtc-chart-tick-y")).map(t => Number(t.textContent)),
            }
        })
        assertEquals(state.boxes, 2)
        assertEquals(state.outliers, 1)
        assertEquals(state.row, ["1", "3.25", "5.5", "7.75", "9"])
        if (Math.max(...state.ticks) < 100) {fail(`ERROR: the axis has to reach the outlier, got ${state.ticks}`)}
    })

    itWrap("a candlestick colors by direction, and reads all four numbers on hover", "more-charts", "#candles-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("candles-chart") as HTMLElement
            const hit = root.querySelector("rect.vtc-chart-hit") as SVGRectElement
            const box = hit.getBoundingClientRect()
            hit.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: box.left + 40, clientY: box.top + 5}))
            const rows = Array.from(root.querySelectorAll(".vtc-chart-tooltip-row")).filter(r => !(r as HTMLElement).hidden).map(r => (r as HTMLElement).innerText.replace(/\s+/g, " ").trim())
            return {
                bodies: root.querySelectorAll("rect.vtc-chart-candle").length,
                fills: Array.from(root.querySelectorAll("rect.vtc-chart-candle")).map(c => c.getAttribute("fill")),
                ohlc: document.getElementById("ohlc-chart")!.querySelectorAll("path.vtc-chart-candle").length,
                rows,
            }
        })
        assertEquals(state.bodies, 5)
        assertEquals(state.ohlc, 5)
        assertEquals(state.fills[0], "var(--secondary)")
        assertEquals(state.fills[1], "var(--accent)")
        assertEquals(state.rows.length, 4)
        assertEquals(state.rows[0].slice(0, 1), "O")
    })

    itWrap("a heatmap shades by value, leaves a missing cell empty and has a scale", "more-charts", "#heatmap-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("heatmap-chart") as HTMLElement
            const cells = Array.from(root.querySelectorAll("rect.vtc-chart-cell")) as SVGRectElement[]
            const diverging = Array.from(document.getElementById("diverging-chart")!.querySelectorAll("rect.vtc-chart-cell")).map(c => c.getAttribute("fill") ?? "")
            return {
                cells: cells.length,
                empty: root.querySelectorAll("rect.vtc-chart-cell-empty").length,
                labels: Array.from(root.querySelectorAll("text.vtc-chart-cell-label")).map(t => t.textContent),
                scale: root.querySelectorAll("rect.vtc-chart-scale-step").length,
                fills: [cells[0].getAttribute("fill") ?? "", cells[5].getAttribute("fill") ?? ""],
                diverging,
            }
        })
        assertEquals(state.cells, 6)
        assertEquals(state.empty, 1)
        assertEquals(state.labels, ["1", "2", "3", "4", "6"])
        assertEquals(state.scale, 12)
        if (!state.fills[0].includes(" 8%") || !state.fills[1].includes(" 100%")) {fail(`ERROR: fills should follow the value: ${state.fills}`)}
        if (!state.diverging[0].includes("--accent") || !state.diverging[1].includes("--primary")) {fail(`ERROR: expected two hues around zero: ${state.diverging}`)}
    })

    itWrap("a calendar heatmap lays days out by weekday and week", "more-charts", "#calendar-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("calendar-chart") as HTMLElement
            const cells = Array.from(root.querySelectorAll("rect.vtc-chart-cell")) as SVGRectElement[]
            const months = root.querySelectorAll("text.vtc-chart-month-label").length
            const first = {x: Number(cells[0].getAttribute("x")), y: Number(cells[0].getAttribute("y"))}
            const next = {x: Number(cells[1].getAttribute("x")), y: Number(cells[1].getAttribute("y"))}
            return {count: cells.length, months, first, next, height: Number(cells[0].getAttribute("height"))}
        })
        assertEquals(state.count, 120)
        if (state.months < 3) {fail(`ERROR: expected month names, got ${state.months}`)}
        // 1 Jan 2026 is a Thursday, the fourth row of a week starting on Monday
        assertEquals(Math.round(state.first.y - state.height * 3), 20)
        assertEquals(state.next.x, state.first.x)
        assertEquals(Math.round(state.next.y - state.first.y), Math.round(state.height))
    })

    itWrap("a treemap tiles leaves by area without gaps or overlap", "more-charts", "#treemap-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("treemap-chart") as HTMLElement
            const rects = (Array.from(root.querySelectorAll("rect.vtc-chart-cell")) as SVGRectElement[]).map(r => ({
                area: Number(r.getAttribute("width")) * Number(r.getAttribute("height")),
                ratio: Math.max(Number(r.getAttribute("width")) / Number(r.getAttribute("height")), Number(r.getAttribute("height")) / Number(r.getAttribute("width"))),
            }))
            return {rects, legend: root.querySelectorAll(".vtc-chart-legend-item").length, rows: root.querySelectorAll(".vtc-chart-sr tbody tr").length, first: root.querySelector(".vtc-chart-sr tbody th")!.textContent}
        })
        assertEquals(state.rects.length, 5)
        assertEquals(state.legend, 3)
        assertEquals(state.rows, 5)
        assertEquals(state.first, "Engineering / Platform")
        const worst = Math.max(...state.rects.map(r => r.ratio))
        if (worst > 8) {fail(`ERROR: squarifying should avoid long slivers, worst ratio ${worst}`)}
    })

    itWrap("a sunburst draws a ring per level", "more-charts", "#sunburst-chart", async (_selection: ElementHandle) => {
        const arcs = await page.evaluate(() => document.getElementById("sunburst-chart")!.querySelectorAll("path.vtc-chart-arc").length)
        // Three top-level nodes and four children
        assertEquals(arcs, 7)
    })

    itWrap("a funnel keeps its order and shows each stage's share of the first", "more-charts", "#funnel-chart", async (_selection: ElementHandle) => {
        const labels = await page.evaluate(() => Array.from(document.getElementById("funnel-chart")!.querySelectorAll("text.vtc-chart-funnel-value")).map(t => t.textContent))
        assertEquals(labels, ["1000 · 100.0%", "400 · 40.0%", "100 · 10.0%"])
    })

    itWrap("a sankey sizes bands by value, in columns, and leaves out a link closing a loop", "more-charts", "#sankey-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("sankey-chart") as HTMLElement
            const nodes = Array.from(root.querySelectorAll("rect.vtc-chart-node")).map(r => ({x: Number(r.getAttribute("x")), y: Number(r.getAttribute("y")), h: Number(r.getAttribute("height"))}))
            return {nodes, bands: root.querySelectorAll("path.vtc-chart-link").length, rows: root.querySelectorAll(".vtc-chart-sr tbody tr").length, svgHeight: Number(root.querySelector("svg")!.getAttribute("height"))}
        })
        assertEquals(state.bands, 3)
        assertEquals(state.rows, 3)
        // Web and Mail in the first column, Trial in the second, Paid in the third
        assertEquals(state.nodes[0].x, state.nodes[1].x)
        if (!(state.nodes[2].x > state.nodes[0].x && state.nodes[3].x > state.nodes[2].x)) {fail(`ERROR: columns out of order: ${JSON.stringify(state.nodes)}`)}
        // Trial takes all of Web's 60 and Mail's 40, so it is as tall as both
        if (Math.abs(state.nodes[2].h - state.nodes[0].h - state.nodes[1].h) > 1) {fail(`ERROR: node height should follow flow: ${JSON.stringify(state.nodes)}`)}
        for (const node of state.nodes) {
            if (node.y < -0.5 || node.y + node.h > state.svgHeight + 0.5) {fail(`ERROR: a node left the drawing: ${JSON.stringify(node)}`)}
        }
    })


    itWrap("the arrow keys walk a line chart, read each point aloud, and Enter activates it", "features", "#keyboard-line", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("keyboard-line") as HTMLElement
            const host = root.querySelector(".vtc-chart-drawing") as HTMLElement
            const press = (key: string) => {
                const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})
                host.dispatchEvent(event)
                return event.defaultPrevented
            }
            const live = () => root.querySelector("[aria-live]")!.textContent
            const tip = root.querySelector(".vtc-chart-tooltip") as HTMLElement
            host.focus()
            const tabPrevented = press("Tab")
            press("ArrowRight")
            const first = live()
            press("ArrowRight")
            const second = live()
            press("End")
            const last = live()
            press("Enter")
            const shownBefore = tip.classList.contains("vtc-chart-tooltip-visible")
            press("Escape")
            return {
                role: host.getAttribute("role"), name: host.getAttribute("aria-label"), tab: host.tabIndex, tabPrevented,
                first, second, last, shownBefore,
                shownAfter: tip.classList.contains("vtc-chart-tooltip-visible"),
                cleared: live(),
                detail: (globalThis as unknown as {lastKeyClick: unknown}).lastKeyClick,
            }
        })
        assertEquals(state.role, "group")
        assertEquals(state.name, "Keys on a line")
        assertEquals(state.tab, 0)
        // A chart must never become a keyboard trap
        assertEquals(state.tabPrevented, false)
        assertEquals(state.first, "Jan, Sales 120")
        assertEquals(state.second, "Feb, Sales 150")
        assertEquals(state.last, "Apr, Sales 200")
        assertEquals(state.shownBefore, true)
        assertEquals(state.shownAfter, false)
        assertEquals(state.cleared, "")
        assertEquals(state.detail, {label: "Apr", index: 3})
    })

    itWrap("the keyboard walks bars and slices through their marks", "features", "#keyboard-bars", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const walk = (id: string) => {
                const root = document.getElementById(id) as HTMLElement
                const host = root.querySelector(".vtc-chart-drawing") as HTMLElement
                host.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true}))
                host.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true}))
                return {said: root.querySelector("[aria-live]")!.textContent, active: root.querySelectorAll(".vtc-chart-mark-active").length}
            }
            const off = document.querySelector("#keyboard-off .vtc-chart-drawing") as HTMLElement
            return {bars: walk("keyboard-bars"), pie: walk("keyboard-pie"), off: off.hasAttribute("tabindex")}
        })
        assertEquals(state.bars, {said: "down, V -5", active: 1})
        assertEquals(state.pie, {said: "y 3 (75.0%)", active: 1})
        assertEquals(state.off, false)
    })

    itWrap("plus and minus zoom from the keyboard, and shift and an arrow pans", "features", "#keyboard-line", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const host = document.querySelector("#keyboard-line .vtc-chart-drawing") as HTMLElement
            host.dispatchEvent(new KeyboardEvent("keydown", {key: "+", bubbles: true}))
            return {zoomed: host.querySelector("svg") !== null}
        })
        assertEquals(state.zoomed, true)
        await settle()
        const ticks = await page.evaluate(() => {
            const host = document.querySelector("#keyboard-line .vtc-chart-drawing") as HTMLElement
            const clipped = host.querySelector("g.vtc-chart-plot")!.hasAttribute("clip-path")
            host.dispatchEvent(new KeyboardEvent("keydown", {key: "0", bubbles: true}))
            return clipped
        })
        assertEquals(ticks, true)
        await settle()
        const reset = await page.evaluate(() => document.querySelector("#keyboard-line g.vtc-chart-plot")!.hasAttribute("clip-path"))
        assertEquals(reset, false)
    })

    itWrap("patterns tell series apart without color, in bars, lines and the legend", "features", "#patterned-bars", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const bars = document.getElementById("patterned-bars") as HTMLElement
            const lines = document.getElementById("patterned-lines") as HTMLElement
            const fills = new Set(Array.from(bars.querySelectorAll("rect.vtc-chart-bar")).map(b => b.getAttribute("fill")))
            return {
                fills: [...fills],
                defined: [...fills].every(fill => bars.querySelector((fill as string).slice(4, -1)) !== null),
                swatch: (bars.querySelector(".vtc-chart-legend-swatch") as HTMLElement).style.backgroundImage.includes("gradient"),
                dashes: Array.from(lines.querySelectorAll("path.vtc-chart-line")).map(l => l.getAttribute("stroke-dasharray")),
                plain: document.querySelector("#negative-bars rect.vtc-chart-bar")!.getAttribute("fill"),
            }
        })
        assertEquals(state.fills.length, 2)
        if (!state.fills.every(fill => fill?.startsWith("url(#"))) {fail(`ERROR: expected pattern fills, got ${state.fills}`)}
        assertEquals(state.defined, true)
        assertEquals(state.swatch, true)
        assertEquals(state.dashes[0], null)
        assertEquals(state.dashes[1], "8 4")
        if (state.plain?.startsWith("url(")) {fail("ERROR: patterns are opt-in")}
    })

    itWrap("toCsv quotes properly, keeps gaps empty and defuses a formula", "features", "#export-chart", async (_selection: ElementHandle) => {
        const csv = await page.evaluate(() => (globalThis as unknown as {exporting: {toCsv: () => string}}).exporting.toCsv())
        assertEquals(csv, `,A,B\r\n'=SUM(A1),1,-2\r\n"He said ""hi"", ok",3,`)
    })

    itWrap("toSvgString stands alone: titled, with a legend, resolved colors and no page classes", "features", "#export-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const markup = (globalThis as unknown as {exporting: {toSvgString: () => string}}).exporting.toSvgString()
            // The page's Trusted Types policy refuses a bare string here, and this parse is the test's own
            const {trustedTypes} = globalThis as unknown as {trustedTypes: {createPolicy: (name: string, rules: {createHTML: (s: string) => string}) => {createHTML: (s: string) => string}}}
            const trusted = trustedTypes.createPolicy("test-parse", {createHTML: (s) => s}).createHTML(markup)
            const parsed = new DOMParser().parseFromString(trusted, "image/svg+xml")
            return {
                error: parsed.querySelector("parsererror") !== null,
                hasVar: markup.includes("var(--"),
                hasClass: markup.includes("class="),
                hasHit: markup.includes("vtc-chart-hit"),
                texts: Array.from(parsed.querySelectorAll("text")).map(t => t.textContent),
                paths: parsed.querySelectorAll("path").length,
                ns: parsed.documentElement.getAttribute("xmlns"),
            }
        })
        assertEquals(state.error, false)
        assertEquals(state.hasVar, false)
        assertEquals(state.hasClass, false)
        assertEquals(state.hasHit, false)
        assertEquals(state.ns, "http://www.w3.org/2000/svg")
        if (!state.texts.includes("To export") || !state.texts.includes("A")) {fail(`ERROR: expected the title and legend, got ${state.texts}`)}
        if (state.paths < 1) {fail("ERROR: expected the line in the export")}
    })

    itWrap("toPngBlob makes a real PNG, from a canvas chart too", "features", "#export-canvas", async (_selection: ElementHandle) => {
        await page.evaluate(() => {
            const global = globalThis as unknown as Record<string, unknown> & {
                exporting: {toPngBlob: () => Promise<Blob>}, canvasExporting: {toPngBlob: () => Promise<Blob>, toSvgString: () => string}
            }
            const signature = async (blob: Blob) => ({type: blob.type, size: blob.size, head: Array.from(new Uint8Array(await blob.arrayBuffer()).slice(1, 4))})
            global.pngDone = false
            Promise.all([global.exporting.toPngBlob(), global.canvasExporting.toPngBlob()]).then(async ([plain, canvas]) => {
                global.pngResult = {plain: await signature(plain), canvas: await signature(canvas), image: global.canvasExporting.toSvgString().includes("<image")}
                global.pngDone = true
            }).catch(error => {
                global.pngResult = String(error)
                global.pngDone = true
            })
        })
        for (let i = 0; i < 40; i++) {
            if (await page.evaluate(() => (globalThis as unknown as {pngDone: boolean}).pngDone)) {break}
            await settle()
        }
        const result = await page.evaluate(() => (globalThis as unknown as {pngResult: {plain: {type: string, size: number, head: number[]}, canvas: {type: string, size: number, head: number[]}, image: boolean}}).pngResult)
        assertEquals(result.plain.type, "image/png")
        // "PNG", straight after the signature's first byte
        assertEquals(result.plain.head, [80, 78, 71])
        assertEquals(result.canvas.head, [80, 78, 71])
        assertEquals(result.image, true)
        if (result.plain.size < 500) {fail(`ERROR: a blank image is suspiciously small: ${result.plain.size}`)}
    })


    itWrap("a zoomed view with nothing in it goes away when the data changes under it", "features", "#zoom-chart", async (_selection: ElementHandle) => {
        const view = await page.evaluate(() => {
            const chart = (globalThis as unknown as {zoomable: {zoomTo: (v: unknown) => void, update: (a: unknown) => void, getView: () => unknown}}).zoomable
            chart.zoomTo({xMin: 7, xMax: 9})
            chart.update({data: [{label: "a", values: {v: 1}}, {label: "b", values: {v: 2}}]})
            return chart.getView() ?? null
        })
        assertEquals(view, null)
    })

    itWrap("a drag on a touch screen stays the chart's, and scrolling up and down stays the page's", "features", "#zoom-chart", async (_selection: ElementHandle) => {
        const action = await page.evaluate(() => (document.querySelector("#zoom-chart svg") as unknown as HTMLElement).style.touchAction)
        assertEquals(action, "pan-y")
    })

    itWrap("a value label at the plot's far end stays clear of the axis labels", "features", "#values-chart", async (_selection: ElementHandle) => {
        const state = await page.evaluate(() => {
            const root = document.getElementById("values-chart") as HTMLElement
            const label = Array.from(root.querySelectorAll("text.vtc-chart-value-label")).find(t => t.textContent === "-5u") as SVGTextElement
            const down = Array.from(root.querySelectorAll("text.vtc-chart-tick-x")).find(t => t.textContent === "down") as SVGTextElement
            return {labelBottom: label.getBoundingClientRect().bottom, tickTop: down.getBoundingClientRect().top}
        })
        if (state.labelBottom > state.tickTop) {fail(`ERROR: the value label runs into the axis label: ${JSON.stringify(state)}`)}
    })

})
