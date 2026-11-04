/**
 * Refuses web features that aren't Baseline "widely available" yet - see "Browser support" in
 * CLAUDE.md for the rule this guards.
 *
 * Nothing between this source and a browser rewrites it: `deno bundle` has no target, so the
 * syntax, the CSS in every `mountStyles` string and the DOM calls ship exactly as written. A feature
 * one browser lacks is therefore broken for that browser's readers, and nothing else here notices -
 * the Astral suite drives Chrome.
 *
 * This is a deny-list, not a full checker: the features listed are ones that are easy to reach for
 * and not yet in every engine for long enough. It is meant to be revised now and then from MDN's
 * Baseline data - an entry comes off once the feature is widely available, and a new tempting one
 * goes on. A line may use a listed feature as an enhancement, when the page works without it, by
 * saying so in a JS comment - `// baseline-ok: <what happens without it>` - at the end of that line,
 * or on its own line directly above. Always a JS comment, which the minified bundle drops: never a
 * CSS comment inside a stylesheet string, which would ship. In a stylesheet, end the string before
 * the line and put the comment between the two parts (`` `...` + // baseline-ok: ... `` then the
 * next `` `...` ``), the way `Menu`'s styles carry their notes. A CSS declaration a browser doesn't
 * know is dropped, so one that only adds polish qualifies; one the layout depends on doesn't.
 *
 *   deno task check-baseline              src/ and showcase/src/
 *   deno task check-baseline <dir|file>…  those instead
 */

type Entry = {pattern: RegExp, feature: string}

/**
 * Not Baseline widely available as of 2026-11. Patterns name the feature the way code uses it,
 * so prose about it in a comment doesn't match - comment lines are skipped as well.
 */
const DENIED: Entry[] = [
    // CSS
    {pattern: /\b(anchor-name|position-anchor|position-area|position-try(-fallbacks|-order)?)\s*:|\banchor\(/, feature: "CSS anchor positioning"},
    {pattern: /@scope\b/, feature: "CSS @scope"},
    {pattern: /@starting-style\b/, feature: "CSS @starting-style"},
    {pattern: /\btransition-behavior\s*:|\ballow-discrete\b/, feature: "CSS transition-behavior (discrete transitions)"},
    {pattern: /@property\b/, feature: "CSS @property"},
    {pattern: /\bfield-sizing\s*:/, feature: "CSS field-sizing"},
    {pattern: /\binterpolate-size\s*:|\bcalc-size\(/, feature: "CSS interpolate-size / calc-size()"},
    {pattern: /:state\(/, feature: "CSS :state() (custom states)"},
    {pattern: /@container\s+style\(/, feature: "CSS container style queries"},
    {pattern: /\bview-transition-name\s*:|@view-transition\b|\bstartViewTransition\(/, feature: "View transitions"},
    {pattern: /::details-content\b/, feature: "CSS ::details-content"},
    {pattern: /\bappearance\s*:\s*base-select\b/, feature: "Customizable <select> (appearance: base-select)"},
    {pattern: /\btext-wrap\s*:\s*pretty\b/, feature: "CSS text-wrap: pretty"},
    {pattern: /\bscroll-state\(|\bsibling-(index|count)\(|\breading-flow\s*:|@function\b/, feature: "Recent CSS (scroll-state, sibling-index, reading-flow, @function)"},
    // JavaScript and the DOM
    {pattern: /\brequestIdleCallback\(/, feature: "requestIdleCallback"},
    {pattern: /\bscheduler\.(postTask|yield)\(/, feature: "The Prioritized Task Scheduling API"},
    {pattern: /\bnavigation\.(navigate|addEventListener|currentEntry)\b/, feature: "The Navigation API"},
    {pattern: /\bCloseWatcher\b|\.requestClose\(/, feature: "CloseWatcher / dialog.requestClose()"},
    {pattern: /\.moveBefore\(/, feature: "Element.moveBefore()"},
    {pattern: /\b(commandfor|interestfor)\b|\bhidden\s*=\s*["']until-found["']|\bbeforematch\b/, feature: "Invoker commands, interest invokers, hidden=until-found"},
    {pattern: /\bTemporal\./, feature: "Temporal"},
    {pattern: /\.(union|intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/, feature: "Set methods (union, intersection, ...)"},
    {pattern: /\bPromise\.try\(/, feature: "Promise.try()"},
    {pattern: /\bIterator\.(from|prototype)\b/, feature: "Iterator helpers"},
    {pattern: /\bRegExp\.escape\(/, feature: "RegExp.escape()"},
    {pattern: /\bUint8Array\.fromBase64\(|\.toBase64\(|\bfromHex\(/, feature: "Uint8Array base64 / hex"},
    {pattern: /\bError\.isError\(|\bMath\.sumPrecise\(|\bFloat16Array\b/, feature: "Error.isError(), Math.sumPrecise(), Float16Array"},
    {pattern: /\bIntl\.DurationFormat\b/, feature: "Intl.DurationFormat"},
    {pattern: /\bURL\.parse\(/, feature: "URL.parse() (use new URL() in a try)"},
]

const root = new URL("../", import.meta.url).pathname
const args = Deno.args.length > 0 ? Deno.args : [`${root}src`, `${root}showcase/src`]

/** Every .ts/.tsx file under `path`, or `path` itself */
async function* sourceFiles(path: string): AsyncGenerator<string> {
    const info = await Deno.stat(path)
    if (info.isFile) {
        if (/\.tsx?$/.test(path)) {yield path}
        return
    }
    for await (const entry of Deno.readDir(path)) {
        if (entry.name === "build" || entry.name === "node_modules" || entry.name.startsWith(".")) {continue}
        yield* sourceFiles(`${path}/${entry.name}`)
    }
}

/** A line that is only a comment - prose about a feature, not a use of it */
function isCommentLine(line: string): boolean {
    const trimmed = line.trimStart()
    return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")
}

let found = 0
for (const arg of args) {
    for await (const file of sourceFiles(arg)) {
        const lines = (await Deno.readTextFile(file)).split("\n")
        lines.forEach((line, index) => {
            const marked = (text: string | undefined) => text !== undefined && /\/\/\s*baseline-ok:\s*\S/.test(text)
            if (isCommentLine(line) || marked(line) || (marked(lines[index - 1]) && isCommentLine(lines[index - 1]))) {return}
            for (const entry of DENIED) {
                if (entry.pattern.test(line)) {
                    found++
                    console.error(`${file.replace(root, "")}:${index + 1}: ${entry.feature} is not Baseline widely available yet\n    ${line.trim()}`)
                }
            }
        })
    }
}
if (found > 0) {
    console.error(`\n${found} use${found === 1 ? "" : "s"} of features not every browser has had long enough. Use something older, or - when the page works without it - say so in a JS comment, at the end of the line or on its own line above it: // baseline-ok: <what happens without it> (never a CSS comment in a stylesheet string - that ships). The rule: CLAUDE.md, "Browser support".`)
    Deno.exit(1)
}
console.log("ok   only Baseline widely available features (by the deny-list in scripts/check-baseline.ts)")
