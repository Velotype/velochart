import { findLeaks } from "@velotype/velotype/devtools"

/**
 * Loaded on every gallery page, beside the module (base_server.ts): `__leaks()` lists what velotype
 * still holds that the page no longer shows - a Component left mounted off the page, one created
 * and never placed, a RenderObject drawn nowhere - by name, and the suite fails a test that leaves
 * any. velotype's `findLeaks()` reads every velotype instance on the page through its devtools hook,
 * so this bundle's own copy sees the module's.
 */
;(globalThis as unknown as {__leaks: () => {mountedOffPage: string[], neverPlaced: string[], heldOffPage: number}}).__leaks = () => {
    const leaks = findLeaks()
    const names = (list: object[]) => list.map(c => c.constructor.name).sort()
    return {mountedOffPage: names(leaks.mountedOffPage), neverPlaced: names(leaks.neverPlaced), heldOffPage: leaks.heldOffPage.length}
}
