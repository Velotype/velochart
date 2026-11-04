import { replaceElementWithRoot } from "@velotype/velotype"

import { setThemeOnSelector, Theme } from "@velotype/velodesign"
import { LineChart } from "../../src/index.ts"

/** Charts holding far more points than a plot has pixels. Their own page, since they take a moment */

const long = Array.from({length: 100_000}, (_, i) => ({x: i, values: {v: Math.sin(i / 500) * 10 + (i === 50_000 ? 40 : 0)}}))

Theme.injectStyles()
setThemeOnSelector("#large-root")

const mainPage = document.getElementById("main-page")
if (mainPage) {
    replaceElementWithRoot(<div id="large-root" data-theme="light" style={{padding: "8px"}}>
        <div id="long-line"><LineChart data={long} series={[{key: "v"}]} height={160}/></div>
        <div id="long-minmax"><LineChart data={long} series={[{key: "v"}]} downsample={{algorithm: "min-max", threshold: 200}} height={160}/></div>
        <div id="long-whole"><LineChart data={long.slice(0, 2000)} series={[{key: "v"}]} downsample={false} height={100}/></div>
        <div id="canvas-chart"><LineChart renderer="canvas" data={long} series={[{key: "v"}]} height={160}/></div>
    </div>, mainPage)
}
