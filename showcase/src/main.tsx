import { replaceElementWithRoot } from "@velotype/velotype"

import { History, Theme } from "@velotype/velodesign"
import { AppShell } from "./app-shell.tsx"
import { registerCategoryIcons } from "./data/category-icons.ts"

// Local dev (showcase/server.ts) serves this app at the domain root, same as any consumer's own
// site, so there's nothing to configure there. The GitHub Pages build is the one deployment that
// serves it under a path prefix (a project site's own repo-name subdirectory) - its own index.html
// sets this global before main.js runs, and it's absent everywhere else.
History.configureBasePath((globalThis as unknown as {__VELOCHART_BASE_PATH__?: string}).__VELOCHART_BASE_PATH__ ?? "")

Theme.injectStyles()
// <I i="..."/> renders nothing for a key that has not been registered yet, and the sidebar draws
// one on its very first render
registerCategoryIcons()

const mainPage = document.getElementById("main-page")
if (mainPage) {
    replaceElementWithRoot(<AppShell/>, mainPage)
}
