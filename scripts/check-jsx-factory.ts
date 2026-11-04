/**
 * Checks that the package still works when it is compiled as a dependency.
 *
 * A consumer compiles velochart's `.tsx` files with the `jsx` mode from the package's `deno.json`
 * but not its `jsxFactory` or `jsxFragmentFactory`, or with a config of its own. Without the
 * `@jsxRuntime classic` and `@jsx h` pragmas in a file, the compiler calls `React.createElement`,
 * which does not exist. velodesign 0.1.2 was published like that and broke every consumer. Nothing
 * else in this repository sees it, because here the root config supplies the factory. `src/` has no
 * `.tsx` today, so this passes trivially until a chart is written in JSX - which is when it matters.
 *
 * This bundles `src/index.ts` with two configs that a dependency can get: the package's with the
 * factories removed, and an automatic one like a consumer's own. It fails if the output calls `React`.
 *
 *   deno task check-jsx
 */
const root = new URL("../", import.meta.url).pathname
const packageConfig = JSON.parse(await Deno.readTextFile(`${root}deno.json`))

const withoutFactories = structuredClone(packageConfig)
delete withoutFactories.compilerOptions.jsxFactory
delete withoutFactories.compilerOptions.jsxFragmentFactory

const automatic = structuredClone(packageConfig)
automatic.compilerOptions = {...automatic.compilerOptions, jsx: "react-jsx", jsxImportSource: "@velotype/velotype"}
delete automatic.compilerOptions.jsxFactory
delete automatic.compilerOptions.jsxFragmentFactory

let failed = false
for (const [name, config] of [["the package's config without its factories", withoutFactories], ["an automatic config", automatic]] as const) {
    const configPath = `${root}deno.dependency-config.json`
    const outputPath = await Deno.makeTempFile({suffix: ".js"})
    try {
        await Deno.writeTextFile(configPath, JSON.stringify(config))
        const result = await new Deno.Command("deno", {
            args: ["bundle", "--platform", "browser", "--config", configPath, `${root}src/index.ts`, "--output", outputPath],
            stdout: "null", stderr: "piped",
        }).output()
        if (!result.success) {
            console.error(`FAIL with ${name}: the bundle did not build\n${new TextDecoder().decode(result.stderr)}`)
            failed = true
            continue
        }
        const calls = (await Deno.readTextFile(outputPath)).match(/React\.(createElement|Fragment)/g) ?? []
        if (calls.length > 0) {
            console.error(`FAIL with ${name}: the package calls React ${calls.length} times. A .tsx file is missing its pragmas.`)
            failed = true
        } else {
            console.log(`ok   with ${name}`)
        }
    } finally {
        await Deno.remove(configPath).catch(() => {})
        await Deno.remove(outputPath).catch(() => {})
    }
}
Deno.exit(failed ? 1 : 0)
