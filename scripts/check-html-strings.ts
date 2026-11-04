/**
 * Refuses anything that turns a string into DOM - see "No HTML strings" in CLAUDE.md for the rule
 * this guards.
 *
 * Text that reaches one of these from a caller's data is an injection, and a page with a strict
 * Trusted Types policy throws on all of them. The Astral suite runs under that policy too, which
 * catches what a text search can't see; this catches the code paths no test drives. There is no
 * opt-out comment, because nothing here needs one: build nodes instead.
 *
 *   deno task check-html-strings              src/ and showcase/src/
 *   deno task check-html-strings <dir|file>…  those instead
 */

type Entry = {pattern: RegExp, feature: string}

/** Comment lines are skipped, so prose about why these are out doesn't match */
const DENIED: Entry[] = [
    {pattern: /\.(innerHTML|outerHTML)\b/, feature: "innerHTML / outerHTML"},
    {pattern: /\b(insertAdjacentHTML|createContextualFragment)\b/, feature: "insertAdjacentHTML / createContextualFragment"},
    {pattern: /\b(setHTML|setHTMLUnsafe|parseHTMLUnsafe)\b/, feature: "setHTML / setHTMLUnsafe / parseHTMLUnsafe"},
    {pattern: /\bdocument\.(write|writeln)\(/, feature: "document.write"},
    {pattern: /\bDOMParser\b/, feature: "DOMParser"},
    {pattern: /\bsrcdoc\b/, feature: "iframe srcdoc"},
]

/** velotype's raw components, each of which sets innerHTML from a string attr */
const RAW_COMPONENT_IMPORT = /import\s+(?:type\s+)?\{[^}]*\b(?:HTML|SVG|MATH)\b[^}]*\}\s*from\s*["'][^"']*velotype[^"']*["']/g

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
        // Blanked rather than removed, so a match in the joined text still has its line number
        const lines = (await Deno.readTextFile(file)).split("\n").map(line => isCommentLine(line) ? "" : line)
        lines.forEach((line, index) => {
            for (const entry of DENIED) {
                if (entry.pattern.test(line)) {
                    found++
                    console.error(`${file.replace(root, "")}:${index + 1}: ${entry.feature} turns a string into DOM\n    ${line.trim()}`)
                }
            }
        })
        const text = lines.join("\n")
        for (const match of text.matchAll(RAW_COMPONENT_IMPORT)) {
            found++
            const line = text.slice(0, match.index).split("\n").length
            console.error(`${file.replace(root, "")}:${line}: velotype's HTML, SVG and MATH components set innerHTML from a string`)
        }
    }
}
if (found > 0) {
    console.error(`\n${found} use${found === 1 ? "" : "s"} of an API that turns a string into DOM. Build the nodes instead. The rule: CLAUDE.md, "No HTML strings".`)
    Deno.exit(1)
}
console.log("ok   no API that turns a string into DOM (by the deny-list in scripts/check-html-strings.ts)")
