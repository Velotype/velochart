/**
 * Bundles the gallery modules the tests serve - all of them, or a named subset.
 *
 * Two things keep it fast as the gallery grows, and the second matters far more than the first:
 *
 *   - **In parallel, but modestly.** A small pool rather than one at a time. Memory is the limit
 *     here, not cores - see the note on `VTC_BUNDLE_JOBS` below.
 *   - **Only what is stale.** A module is rebuilt when its own source, anything under `src/`, or
 *     this script is newer than its output. Mid-iteration that is usually nothing at all.
 *
 * The staleness test is deliberately coarse - *any* change under `src/` rebuilds *every* module -
 * because a gallery module's real dependency graph is the whole package: one shared stylesheet or
 * one `core/` helper reaches most of them, and a per-module graph that was wrong would hand back
 * a green suite built from stale code. Coarse and correct beats precise and occasionally lying.
 *
 *   deno run -A ./bundle.ts                  every module, skipping what is current
 *   deno run -A ./bundle.ts charts           that one and nothing else
 *   deno run -A ./bundle.ts --force          rebuild regardless of timestamps
 */
const here = new URL(".", import.meta.url).pathname
const srcDir = `${here}../src`

async function newestMtime(dir: string): Promise<number> {
    let newest = 0
    for await (const entry of Deno.readDir(dir)) {
        const path = `${dir}/${entry.name}`
        if (entry.isDirectory) {
            newest = Math.max(newest, await newestMtime(path))
        } else {
            newest = Math.max(newest, (await Deno.stat(path)).mtime?.getTime() ?? 0)
        }
    }
    return newest
}

async function mtimeOf(path: string): Promise<number> {
    try {
        return (await Deno.stat(path)).mtime?.getTime() ?? 0
    } catch {
        return 0
    }
}

export async function allModules(): Promise<string[]> {
    const names: string[] = []
    for await (const entry of Deno.readDir(`${here}test_modules`)) {
        if (entry.isFile && entry.name.endsWith(".tsx")) {
            names.push(entry.name.slice(0, -4))
        }
    }
    return names.sort()
}

export async function bundleModules(requested: string[], force: boolean): Promise<{built: number, skipped: number}> {
    const known = new Set(await allModules())
    const unknown = requested.filter(name => !known.has(name))
    if (unknown.length > 0) {
        throw new Error(`no gallery module named: ${unknown.join(", ")}`)
    }
    const modules = requested.length > 0 ? requested : [...known].sort()
    const floor = Math.max(await newestMtime(srcDir), await mtimeOf(`${here}bundle.ts`))

    const stale: string[] = []
    for (const name of modules) {
        const output = await mtimeOf(`${here}build/${name}.js`)
        const source = await mtimeOf(`${here}test_modules/${name}.tsx`)
        if (force || output === 0 || output < Math.max(floor, source)) {
            stale.push(name)
        }
    }

    // ⚠️ **Memory, not cores, is what limits this.** Each `deno bundle` holds the whole module graph,
    // and the pool was briefly two per core - eight processes on a four-core machine - which took
    // the machine down with memory pressure rather than merely slowing it. Half the cores, floor of
    // two, and the CPU is not the thing being saturated anyway: most of the win over running them
    // one at a time is overlapping module resolution and IO, which a small pool already gets.
    //
    // `VTC_BUNDLE_JOBS` overrides it, for a machine with memory to spare.
    const requestedJobs = Number(Deno.env.get("VTC_BUNDLE_JOBS") ?? "")
    const jobs = Number.isFinite(requestedJobs) && requestedJobs > 0
        ? Math.floor(requestedJobs)
        : Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2))
    const limit = Math.min(stale.length, jobs)
    let next = 0
    const failures: string[] = []
    const worker = async () => {
        while (next < stale.length) {
            const name = stale[next++]
            const result = await new Deno.Command(Deno.execPath(), {
                args: ["bundle", `./test_modules/${name}.tsx`, "--output", `./build/${name}.js`, "--sourcemap=linked", "--quiet"],
                cwd: here, stdout: "null", stderr: "piped",
            }).output()
            if (!result.success) {
                failures.push(`${name}: ${new TextDecoder().decode(result.stderr).trim().split("\n").slice(0, 3).join(" ")}`)
            }
        }
    }
    await Promise.all(Array.from({length: limit}, worker))
    if (failures.length > 0) {
        throw new Error(`bundling failed:\n  ${failures.join("\n  ")}`)
    }
    return {built: stale.length, skipped: modules.length - stale.length}
}

if (import.meta.main) {
    const force = Deno.args.includes("--force")
    const names = Deno.args.filter(a => !a.startsWith("--"))
    const started = performance.now()
    const {built, skipped} = await bundleModules(names, force)
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    console.log(`bundled ${built}, skipped ${skipped} already current, in ${seconds}s`)
}
