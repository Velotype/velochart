import { setStylesheet } from "./velotype.ts"

/**
 * Which cascade layer a stylesheet belongs to.
 *
 * - `base` - the stylesheet every chart shares (`chart-common`).
 * - `component` - a chart's own rules, which must be able to override `base` without reaching for
 *   specificity.
 */
export type StyleLayer = "base" | "component"

/**
 * `velodesign` is named first so the order is the same whichever package's stylesheet attaches
 * first: velodesign's reset can never beat a chart's rules, and naming a layer that never appears
 * costs nothing on a page without velodesign.
 */
const layerOrder = "@layer velodesign,velochart.base,velochart.component;"

let isLayerOrderDeclared = false

/**
 * Mounts one stylesheet inside velochart's cascade layer.
 *
 * **Every stylesheet this package ships goes through here, and none calls `setStylesheet` directly.**
 * `setStylesheet` pushes onto `document.adoptedStyleSheets`, so without layers the cascade order is
 * the order sheets were attached, which depends on what the reader happened to render first.
 *
 * An unlayered rule beats a layered one whatever its specificity, so a consumer's own CSS always
 * wins, and the layer order is declared once before any sheet attaches, because layer precedence
 * otherwise follows first appearance.
 */
export function mountStyles(cssText: string, key: string, layer: StyleLayer = "component", resetSheet: boolean = false): void {
    if (!isLayerOrderDeclared) {
        isLayerOrderDeclared = true
        setStylesheet(layerOrder, "vtc/LayerOrder")
    }
    setStylesheet(`@layer velochart.${layer}{${cssText}}`, key, resetSheet)
}
