/**
 * Every name velochart takes from velotype, in one place - and the only module in `src/` that names
 * `@velotype/velotype` at all.
 *
 * **This exists for the bytes, not for tidiness.** esbuild emits one `import` statement per source
 * module that imports an external package, each binding its own alias, and never merges them - and
 * it keeps that statement for every module it *scanned*, tree-shaken or not, because an external
 * module might have side effects it cannot rule out. Importing velotype directly from every chart
 * would put that cost in every consumer bundle, however little of the package they use.
 *
 * ⚠️ **It has to be an explicit list - never `export *`.** Against an external package esbuild cannot
 * enumerate the names, so it falls back to a namespace import plus a `__reExport` helper and rewrites
 * every call site to `(0, ns.foo)()`, which defeats tree-shaking outright. A name that is missing
 * here is a compile error, so the list cannot silently drift.
 *
 * `scripts/bundle-size.ts` asserts the bundle has exactly one import statement for velotype.
 */
export { Component, getComponent, passthroughAttrsToElement, setStylesheet } from "@velotype/velotype"
export type {
    EmptyAttrs,
    FunctionComponent,
    IdAttr,
    RenderableElements,
    StylePassthroughAttrs,
} from "@velotype/velotype"
