import { Icon, registerIcon } from "@velotype/velodesign"

/**
 * One icon per chart category, for the sidebar: line drawings in velodesign's glyph style (a 24-unit
 * box, round ends, a 2-unit line), each reviewed before use, inheriting their colour from the row
 */
const categoryIcons: Record<string, Icon> = {
    // A page with a header band and a chart line, clear of both
    "Dashboard": new Icon(24, 24, "M5.5 4h13a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1 -2.5 2.5h-13a2.5 2.5 0 0 1 -2.5 -2.5v-11a2.5 2.5 0 0 1 2.5 -2.5zM3 8.5h18M7 16l3-2.5 2.5 2 4.5-3.5", 2),
    // Axes with a line
    "Cartesian": new Icon(24, 24, "M4 4v16h16M7.5 15.5l3.5-4.5 3 2.5 4.5-6", 2),
    // A pie with one slice pulled out to the upper right
    "Radial": new Icon(24, 24, "M10.5 5a8 8 0 1 0 8.5 8.5h-8.5zM13.5 3v7.5H21a7.5 7.5 0 0 0-7.5-7.5z", 2),
    // A 3 by 3 grid drawn as one frame
    "Matrix": new Icon(24, 24, "M6 3.5h12a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1 -2.5 2.5h-12a2.5 2.5 0 0 1 -2.5 -2.5v-12a2.5 2.5 0 0 1 2.5 -2.5zM3.5 9.17h17M3.5 14.83h17M9.17 3.5v17M14.83 3.5v17", 2),
    // A treemap: one large block beside two, drawn as one frame
    "Hierarchy": new Icon(24, 24, "M6 3.5h12a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1 -2.5 2.5h-12a2.5 2.5 0 0 1 -2.5 -2.5v-12a2.5 2.5 0 0 1 2.5 -2.5zM12 3.5v17M12 11.5h8.5", 2),
    // A band narrowing from left to right
    "Flow": new Icon(24, 24, "M3.5 4.5h3.5c6 0 8 6 13.5 6v3c-5.5 0-7.5 6-13.5 6H3.5z", 2),
    // A trend, as one line
    "Inline": new Icon(24, 24, "M3 16.5l5-5 4 4 9-9", 2),
    // Not a category: the magnifier that stands in for the search box on the collapsed rail. velodesign's
    // zoom lens, with a glint thinner than its line as a second layer
    "Search": new Icon(24, 24, "M16.7 10.5a6.2 6.2 0 1 1-12.4 0 6.2 6.2 0 1 1 12.4 0zM15.2 15.2l4.3 4.3", 2, false, [{d: "M7.6 9.4a3.2 3.2 0 0 1 1.9-1.9", strokeWidth: 1.2}]),
}

let areCategoryIconsRegistered = false

/** The key `<I i={...}/>` renders a category's icon under */
export function categoryIconKey(group: string): string {
    return `showcase-category-${group.toLowerCase().replace(/ /g, "-")}`
}

/** Registers every category icon once, before anything renders one */
export function registerCategoryIcons(): void {
    if (areCategoryIconsRegistered) {
        return
    }
    areCategoryIconsRegistered = true
    for (const group of Object.keys(categoryIcons)) {
        registerIcon(categoryIconKey(group), categoryIcons[group])
    }
}

/** The magnifier shown in place of the search box once the sidebar is a rail */
export const searchIconKey: string = categoryIconKey("Search")
