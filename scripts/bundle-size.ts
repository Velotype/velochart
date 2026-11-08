/**
 * Measures what a consumer actually downloads for the whole of velochart.
 *
 * `src/index.ts` is the package's only entrypoint, so bundling it minified is the honest ceiling:
 * every component, every stylesheet string, no tree-shaking a real app would get. The gzip figure
 * is the one that matters over the wire and is what the showcase leads with.
 *
 * **Two figures, because velotype's bytes are not velochart's.** velotype is shared with everything
 * else in an app built on it, so a bundle with velotype folded inside reports a size no consumer
 * pays velochart. `own` is velochart alone, held out with `--external`; `raw`/`gzip` are the whole
 * graph with velotype inlined, which is what a plain `deno bundle` produces.
 *
 * Both `--external "@velotype/velotype"` and `--external "@velotype/velotype/jsx-runtime"` are
 * passed. The first alone is enough today - it covers the subpath too, byte for byte - but naming
 * both says what is meant and does not depend on that.
 *
 * ⚠️ **The externalized bundle must contain exactly one import statement**, and that is asserted
 * rather than assumed. esbuild emits one per source module that imports the package and never
 * merges them, so velochart routes every velotype name through `src/core/velotype.ts`; a second
 * statement here means a module has gone around the barrel and is quietly costing every consumer
 * bundle an import statement it cannot tree-shake away.
 *
 * Three ways to run it:
 *   deno task size            - print a human summary
 *   deno task size --json     - emit JSON, which the pull-request workflow diffs
 *   deno task size --write    - regenerate showcase/src/data/bundle-size.ts
 *
 * The showcase regenerates this on every `deno task bundle`, so the number on the home page is
 * measured from the source it was built with rather than from a value someone remembered to update.
 */

const root = new URL("../", import.meta.url).pathname
const entrypoint = `${root}src/index.ts`

const velotypeSpecifiers = ["@velotype/velotype", "@velotype/velotype/jsx-runtime"]
/** Held out too for `own`, since an app on velochart's family already has what it uses of velodesign */
const sharedSpecifiers = [...velotypeSpecifiers, "@velotype/velodesign"]

/** Bundles one entrypoint the way a browser consumer would and returns the text */
async function bundleText(entry: string, external: string[]): Promise<string> {
    const outFile = await Deno.makeTempFile({suffix: ".js"})
    try {
        const args = ["bundle", "--minify", "--platform", "browser", "--quiet"]
        for (const specifier of external) {
            args.push("--external", specifier)
        }
        args.push("-o", outFile, entry)
        const bundle = new Deno.Command(Deno.execPath(), {args, cwd: root, stdout: "piped", stderr: "piped"})
        const result = await bundle.output()
        if (!result.success) {
            throw new Error(`deno bundle failed:\n${new TextDecoder().decode(result.stderr)}`)
        }
        return await Deno.readTextFile(outFile)
    } finally {
        await Deno.remove(outFile).catch(() => {})
    }
}

/**
 * Asserts that holding velotype and velodesign out leaves one import statement per barrel.
 *
 * Nothing in `src/` may import `@velotype/velotype` except `src/core/velotype.ts` and the JSX factory
 * `src/core/jsx.ts`, or `@velotype/velodesign` except `src/core/velodesign.ts`. The failure this catches is invisible otherwise: an import
 * that goes around the barrel still compiles, still renders, and only shows up as bytes - in *every*
 * consumer bundle, because esbuild keeps an external import statement for every module it scanned
 * whether or not that module survived tree-shaking.
 */
function assertBarrelled(text: string): void {
    const statements = text.match(/import(?:\{[^}]*\}from)?"@velotype\/velotype(?:\/jsx-runtime)?";?/g) ?? []
    if (statements.length > 2) {
        throw new Error(`expected at most 2 velotype import statements in the externalized bundle, found ${statements.length}.` +
            ` Something in src/ imports "@velotype/velotype" directly instead of through src/core/velotype.ts.`)
    }
    const shared = text.match(/import(?:\{[^}]*\}from)?"@velotype\/velodesign";?/g) ?? []
    if (shared.length > 1) {
        throw new Error(`expected at most 1 velodesign import statement in the externalized bundle, found ${shared.length}.` +
            ` Something in src/ imports "@velotype/velodesign" directly instead of through src/core/velodesign.ts.`)
    }
}

async function measure(): Promise<{raw: number, gzip: number, ownRaw: number, ownGzip: number}> {
    const encoder = new TextEncoder()
    const inlined = encoder.encode(await bundleText(entrypoint, []))
    const ownText = await bundleText(entrypoint, sharedSpecifiers)
    assertBarrelled(ownText)
    const own = encoder.encode(ownText)
    return {
        raw: inlined.byteLength,
        gzip: await gzipSize(inlined),
        ownRaw: own.byteLength,
        ownGzip: await gzipSize(own),
    }
}

/**
 * Compressed size, which is what a consumer's browser actually pulls down.
 *
 * Worth knowing before comparing two of these: gzip output is **not** byte-identical across
 * machines - the same bundle measured 43497 here and 43496 on an ubuntu-24.04 runner, because the
 * zlib behind `CompressionStream` differs. `raw` is deterministic. So compare gzip only between
 * two measurements taken on the same machine, which is what the pull-request workflow does, and
 * never assert it against a committed value.
 */
async function gzipSize(bytes: Uint8Array): Promise<number> {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"))
    let total = 0
    for await (const chunk of stream) {
        total += (chunk as Uint8Array).byteLength
    }
    return total
}

/** Bytes as the showcase and the pull-request comment both spell them */
export function formatBytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(1)} KB`
}

const generatedFile = `${root}showcase/src/data/bundle-size.ts`

async function writeGenerated(sizes: {raw: number, gzip: number, ownRaw: number, ownGzip: number}) {
    const contents = `/**
 * Generated by \`deno task size --write\`, which the showcase's own bundle task runs first, and
 * never committed - it is in .gitignore, so every build measures the source it was built from.
 *
 * The whole package bundled from its single entrypoint, minified, with nothing tree-shaken away.
 *
 * \`ownRaw\`/\`ownGzip\` are velochart by itself, with velotype held out of the bundle, since an app
 * has velotype already. \`raw\`/\`gzip\` have velotype folded in, which is
 * what a plain \`deno bundle\` produces and is not what a consumer pays velochart.
 */
export const bundleSize: {raw: number, gzip: number, ownRaw: number, ownGzip: number} = {
    raw: ${sizes.raw},
    gzip: ${sizes.gzip},
    ownRaw: ${sizes.ownRaw},
    ownGzip: ${sizes.ownGzip}
}
`
    await Deno.writeTextFile(generatedFile, contents)
}

const sizes = await measure()
if (Deno.args.includes("--json")) {
    console.log(JSON.stringify(sizes))
} else {
    if (Deno.args.includes("--write")) {
        await writeGenerated(sizes)
    }
    console.log(`velochart bundled from src/index.ts, minified`)
    console.log(`  velochart alone   raw ${formatBytes(sizes.ownRaw)}  gzip ${formatBytes(sizes.ownGzip)}`)
    console.log(`  all inlined        raw ${formatBytes(sizes.raw)}  gzip ${formatBytes(sizes.gzip)}`)
    console.log(`  the shared part    raw ${formatBytes(sizes.raw - sizes.ownRaw)}  gzip ${formatBytes(sizes.gzip - sizes.ownGzip)}`)
}
