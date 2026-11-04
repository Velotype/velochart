import { Icon, registerIcon } from "@velotype/velodesign"

/**
 * One icon per chart category, for the sidebar. Each is a single path in a 24x24 box, because that
 * is all `Icon` carries - a solid silhouette inheriting its colour from the row it sits in.
 */
const categoryIcons: Record<string, string> = {
    // Four panels, the top row taller
    "Dashboard": "M3 3h8v10H3zM13 3h8v10h-8zM3 15h8v6H3zM13 15h8v6h-8z",
    // Three ascending bars
    "Cartesian": "M3 13h4.5v8H3zM9.75 7.5h4.5V21h-4.5zM16.5 3h4.5v18h-4.5z",
    // A pie with one slice pulled out to the upper right
    "Radial": "M11 3a9.5 9.5 0 109.5 10H11zM13.5 2.5V11h8.5a8.6 8.6 0 00-8.5-8.5z",
    // A grid of cells
    "Matrix": "M3 3h5.3v5.3H3zM9.35 3h5.3v5.3h-5.3zM15.7 3H21v5.3h-5.3zM3 9.35h5.3v5.3H3zM9.35 9.35h5.3v5.3h-5.3zM15.7 9.35H21v5.3h-5.3zM3 15.7h5.3V21H3zM9.35 15.7h5.3V21h-5.3zM15.7 15.7H21V21h-5.3z",
    // A large block beside two smaller ones, nested as a treemap is
    "Hierarchy": "M3 3h10v18H3zM15 3h6v9h-6zM15 14h6v7h-6z",
    // A band narrowing from left to right
    "Flow": "M3 4h4c6 0 8 6 14 6v4c-6 0-8 6-14 6H3z",
    // A jagged trend line, drawn as a solid band
    "Inline": "M2 16.5l6-6 4 4 8.5-8.5 1.5 1.5-10 10-4-4-4.5 4.5z",
    // Not a category: the magnifier that stands in for the search box on the collapsed rail
    "Search": "M10.5 2a8.5 8.5 0 105.2 15.2l4.6 4.6 2.1-2.1-4.6-4.6A8.5 8.5 0 0010.5 2zm0 3a5.5 5.5 0 110 11 5.5 5.5 0 010-11z",
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
        registerIcon(categoryIconKey(group), new Icon(24, 24, categoryIcons[group]))
    }
}

/** The magnifier shown in place of the search box once the sidebar is a rail */
export const searchIconKey: string = categoryIconKey("Search")
