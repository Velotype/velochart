import { createElement, createFragment } from "@velotype/velotype"
import type { Component } from "@velotype/velotype"
import type { JSX as VelotypeJSX } from "@velotype/velotype/jsx-runtime"

/**
 * The JSX factory and fragment factory for every `.tsx` file in the package, as `core/jsx.ts` is in
 * velodesign, whose comment there says why it is this shape. This and `velotype.ts` are the only modules
 * here naming `@velotype/velotype`.
 *
 * ⚠️ **Every `.tsx` file also starts with the `@jsxRuntime classic` and `@jsx h` pragmas.** A consumer
 * compiles this package with the `jsx` mode from its `deno.json` but not the factory, so a file without
 * them calls `React.createElement`. `deno task check-jsx` fails when one is missing.
 *
 * Not exported from `index.ts`: a consumer has no reason to use it.
 */
// deno-lint-ignore no-explicit-any
export function h(tag: any, attrs: any, ...children: any[]): any {
    return createElement(tag, attrs, ...children)
}

/**
 * The JSX namespace that TypeScript looks for on the factory. Without it every intrinsic element
 * is untyped. It restates the three members of velotype's, because a type-only import of a
 * namespace cannot be aliased into one.
 */
// deno-lint-ignore no-namespace
export namespace h {
    // deno-lint-ignore no-namespace
    export namespace JSX {
        // deno-lint-ignore no-explicit-any
        export type ElementType<C extends Component<any>> = VelotypeJSX.ElementType<C>
        export type Element = VelotypeJSX.Element
        export interface IntrinsicElements extends VelotypeJSX.IntrinsicElements {}
    }
}

// deno-lint-ignore no-explicit-any
export const f: (attrs: any, ...children: any[]) => any = createFragment
