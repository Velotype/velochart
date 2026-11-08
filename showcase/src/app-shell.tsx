import { Component, getComponent, RenderBasic, RenderObject, setStylesheet } from "@velotype/velotype"
import type { EmptyAttrs, RenderableElements } from "@velotype/velotype"

import { Button, ColorScheme, highlightMatch, History, I, Link, Navbar, searchHighlightCss, Sidebar, Text, TextBox } from "@velotype/velodesign"
import type { SidebarNavState } from "@velotype/velodesign"
import { categoryIconKey, searchIconKey } from "./data/category-icons.ts"
import type { SidebarItemType } from "@velotype/velodesign"
import { docBySlug, groupByGroupSlug, groupedDocs } from "./data/docs.tsx"
import { HomePage } from "./pages/home.tsx"
import { ComponentPage } from "./pages/component-page.tsx"
import { CategoryPage, categoryPageUrl } from "./pages/category-page.tsx"
import { NotFoundPage } from "./pages/not-found.tsx"

/**
 * The showcase's entries for `Sidebar`, rebuilt whenever the search changes.
 *
 * Everything this used to do by hand - the collapsible rail, the icons, the account row, the
 * resize handle, marking the category that holds the current page - belongs to the component now.
 * That is the point of the showcase: if a behaviour is worth having here it is worth having in the
 * package, and a private copy is how the two drift apart.
 *
 * The open/closed state still lives here, because only this page knows what a filter means.
 * `#openCategories` remembers what the reader expanded, read back off the live tree whenever they
 * toggle; while a filter is active every surviving category is forced open, so a match is never
 * hidden inside a collapsed group - typing "bu" opens Form so Button is visible without a second
 * click.
 */
function buildSidebarItems(filterText: string, openCategories: Set<string>): SidebarItemType[] {
    const filterLower = filterText.trim().toLowerCase()
    const filtering = filterLower.length > 0
    return groupedDocs()
        // A category name is a search term like any other, and it is the one a reader who does not
        // yet know a component's name actually has: typing "chart" found nothing at all while every
        // chart sat one level down inside a category called Charts. A category that matches keeps
        // all of its components rather than none - the match is the category itself.
        .map(bucket => ({
            group: bucket.group,
            docs: bucket.group.toLowerCase().includes(filterLower)
                ? bucket.docs
                : bucket.docs.filter(doc => doc.name.toLowerCase().includes(filterLower)),
        }))
        .filter(bucket => bucket.docs.length > 0)
        .map(bucket => ({
            key: bucket.group,
            // `to` rather than a Link inside the label, which is what this used to be. Sidebar
            // turns an entry with a destination into one link covering the icon, the name and the
            // count, leaving the chevron as the only thing that toggles - so the whole row goes to
            // the category page and the two actions stop competing for the same surface. It is
            // also what marks the group while the reader is *on* that page: NavLink decides what is
            // active, and a plain Link never claimed to be.
            to: categoryPageUrl(bucket.group),
            label: highlightMatch(bucket.group, filterLower),
            icon: <I i={categoryIconKey(bucket.group)}/>,
            // Trailing, not leading: a count announced *before* the category name reads as
            // "3 Typography", and reordering a leading slot in CSS would leave that wrong for a
            // screen reader while looking right on screen
            trailing: <Text type="muted" class="vtc-showcase-sidebar-count">{bucket.docs.length}</Text>,
            defaultOpen: filtering || openCategories.has(bucket.group),
            children: bucket.docs.map(doc => ({
                key: doc.slug,
                to: `/components/${doc.slug}`,
                // highlightMatch marks the substring that matched, so the reader can see *why* an
                // entry survived the filter rather than having to work it out. It is the same
                // helper Combobox, Command and both tables use.
                label: highlightMatch(doc.name, filterLower),
            })),
        }))
}

/** Swaps between Home / a component's detail page / Not Found based on `location.pathname` */
class ContentArea extends Component<EmptyAttrs> {
    #handleLocationChange = () => {
        globalThis.scrollTo({top: 0})
        this.refresh()
    }

    override mount() {
        globalThis.addEventListener("popstate", this.#handleLocationChange)
        globalThis.addEventListener("locationchange", this.#handleLocationChange)
    }
    override unmount() {
        globalThis.removeEventListener("popstate", this.#handleLocationChange)
        globalThis.removeEventListener("locationchange", this.#handleLocationChange)
    }

    override render(): RenderableElements {
        const pathname = History.getPathname()
        if (pathname == "/" || pathname == "") {
            return <HomePage/>
        }
        const componentMatch = pathname.match(/^\/components\/([a-z0-9-]+)\/?$/)
        if (componentMatch) {
            const doc = docBySlug(componentMatch[1])
            if (doc) {
                return <ComponentPage doc={doc}/>
            }
        }
        const categoryMatch = pathname.match(/^\/category\/([a-z0-9-]+)\/?$/)
        if (categoryMatch) {
            const bucket = groupByGroupSlug(categoryMatch[1])
            if (bucket) {
                return <CategoryPage group={bucket.group} docs={bucket.docs}/>
            }
        }
        return <NotFoundPage/>
    }
}

const sidebarCollapsedKey = "vtc-showcase-sidebar-collapsed"

/** Whether the reader left the sidebar collapsed to its icon rail */
function loadSidebarCollapsed(): boolean {
    try {
        return localStorage.getItem(sidebarCollapsedKey) == "true"
    } catch {
        return false
    }
}

function saveSidebarCollapsed(collapsed: boolean) {
    try {
        localStorage.setItem(sidebarCollapsedKey, String(collapsed))
    } catch { /* private browsing with storage disabled - the toggle still works for this session */ }
}

const sidebarWidthKey = "vtc-showcase-sidebar-width"

/** The width the reader last dragged the sidebar to */
function loadSidebarWidth(): number {
    try {
        const stored = Number(localStorage.getItem(sidebarWidthKey))
        return Number.isFinite(stored) && stored > 0 ? stored : 250
    } catch {
        return 250
    }
}

function saveSidebarWidth(width: number) {
    try {
        localStorage.setItem(sidebarWidthKey, String(width))
    } catch { /* as above - the drag still works, it just isn't remembered */ }
}

let areShellStylesMounted = false

/**
 * The persistent page shell: header (brand, dark-mode toggle) and a body split between the
 * searchable sidebar and the routed content area. Built once here (like `Modal`/`ExplorerApp`)
 * and never refreshed as a whole - `SidebarList` and `ContentArea` each manage their own
 * targeted re-renders.
 */
export class AppShell extends Component<EmptyAttrs> {
    #root: HTMLDivElement
    #sidebar: Sidebar
    /** What the reader has expanded, kept across the item rebuilds a search edit causes */
    #openCategories = new Set<string>()
    #filterText = ""
    #darkModeLabel = new RenderBasic<string>(ColorScheme.getColorScheme() == "light" ? "off" : "on")

    /**
     * The one path every theme change here goes through.
     *
     * Two controls now set the same thing - the header's toggle and the account menu's Theme group -
     * and each has a piece of state to keep right: the header shows on/off, the menu shows a tick.
     * Routing both through here is what keeps them agreeing. The menu needs nothing pushed to it
     * because its `selected` entries are functions, but the header's label is a value and does.
     */
    #applyColorScheme(scheme: "light" | "dark" | "default") {
        ColorScheme.setColorScheme(scheme)
        this.#darkModeLabel.value = ColorScheme.getColorScheme() == "light" ? "off" : "on"
    }

    constructor(attrs: EmptyAttrs, children: RenderableElements[]) {
        super(attrs, children)
        if (!areShellStylesMounted) {
            areShellStylesMounted = true
            setStylesheet(`
.vtc-showcase-shell{display:flex;flex-direction:column;min-height:100vh;}
/* Navbar supplies the bar itself; this only makes it stick to the top of the viewport */
.vtc-showcase-header{position:sticky;top:0;background-color:var(--background);z-index:1;}
.vtc-showcase-brand{font-size:1.15em;font-weight:bold;color:inherit;text-decoration:none;}
.vtc-showcase-header-link{color:inherit;text-decoration:none;font-size:0.9em;padding:0.4em 0.6em;border-radius:0.25rem;}
.vtc-showcase-header-link:hover{background-color:var(--background-2);}
.vtc-showcase-body{display:flex;flex-grow:1;min-height:0;}
/*
 * Sidebar owns the panel, the rail, the collapse control, the resize handle and the account row.
 * What is left here is the page's placement of it - sticky under the header, in the chrome layer -
 * plus the few things that are genuinely this site's own: the search box, the category label and
 * the per-category count.
 */
.vtc-showcase-sidebar{
position:sticky;
/*
 * Measured, never assumed. This was top:53px against a header that is actually 55px tall, so once
 * the page scrolled the sidebar pinned two pixels high and painted over the header's bottom border
 * for the width of the sidebar - the line between the two simply vanished, but only after a
 * scroll, which is what made it look intermittent. A hardcoded offset is wrong the moment anything
 * in the header changes size, which includes the reader's own font settings.
 */
top:var(--vtc-showcase-header-height,55px);
/* The chrome layer - see the note on .vtc-showcase-main. Same value as the header, because they
   are the same layer and never overlap each other */
z-index:1;
align-self:flex-start;
height:calc(100vh - var(--vtc-showcase-header-height,55px));
}
.vtc-showcase-sidebar-search .vtd-text-box-wrapper{width:100%;}
.vtc-showcase-sidebar-search .vtd-text-box{width:100%;margin-inline-start:0;box-sizing:border-box;}
.vtc-showcase-sidebar-search-icon{
display:inline-flex;
align-items:center;
justify-content:center;
width:2em;
height:2em;
padding:0;
background:transparent;
border:1px solid transparent;
border-radius:0.25rem;
color:inherit;
cursor:pointer;
}
.vtc-showcase-sidebar-search-icon:hover{background-color:var(--background-2);}
.vtc-showcase-sidebar-search-icon:focus-visible{border-color:var(--primary);outline:none;}
/* A category's own name, which is the label of a Tree branch - the one row shape a leaf never has */
.vtc-showcase-sidebar .vtd-tree-label .vtd-sidebar-label{
font-size:0.75em;
font-weight:bold;
text-transform:uppercase;
letter-spacing:0.05em;
color:var(--background-9);
}
.vtc-showcase-sidebar .vtd-tree-label .vtd-sidebar-link:hover .vtd-sidebar-label{color:var(--primary-8);}
.vtc-showcase-sidebar .vtd-tree-label .vtd-nav-link-active .vtd-sidebar-label{color:var(--primary-8);}
.vtc-showcase-sidebar-count{font-size:0.75em;}
.vtc-showcase-main{flex-grow:1;min-width:0;isolation:isolate;}
/* An open popover has to reach over the chrome, and the isolation above would keep it under the sidebar */
.vtc-showcase-main:has(.vtd-popover-open){position:relative;z-index:2;}
/*
 * The frame every routed page draws itself in. It belongs to the shell rather than to any one
 * page: the component pages and the theme builder both wear it, and while it lived in
 * ComponentPage's stylesheet the theme builder had no padding at all until the reader happened to
 * visit a component page first - a cold load of /theme put its heading flat against the sidebar.
 * A page's own layout stays in that page's stylesheet; this is only the frame.
 */
.vtc-showcase-doc{padding:2em;max-width:62em;min-width:0;flex-grow:1;}
/* Paragraph supplies the colour; this only sizes and spaces a page's lede */
.vtc-showcase-doc-description{font-size:1.05em;margin-block-end:1.5em;max-width:44em;}
${searchHighlightCss}
`, "velochart-showcase/AppShell")
        }

        // clearable: this is the case it exists for - a box the reader edits repeatedly and
        // abandons, where emptying it by hand is several keystrokes
        const searchInput: HTMLElement = <TextBox
            type="text"
            clearable
            clearLabel="Clear the search"
            placeholder="Search charts..."
            class="vtc-showcase-search"
            onInput={(event: Event) => {
                if (event.target instanceof HTMLInputElement) { this.#setFilter(event.target.value) }
            }}/>

        const content = getComponent<ContentArea>(<ContentArea/>)

        // One object, handed to both: the Sidebar writes `overlay` from its own breakpoint and the
        // Navbar reads it to know whether to draw the menu control, so the width lives in one place
        const nav = new RenderObject<SidebarNavState>({open: false, overlay: false})

        this.#sidebar = getComponent<Sidebar>(<Sidebar
            spa
            collapsible
            resizable
            nav={nav}
            class="vtc-showcase-sidebar"
            ariaLabel="Charts by category"
            collapseLabel="Collapse or expand the sidebar"
            header={<div class="vtc-showcase-sidebar-search">{searchInput}</div>}
            // Keeps the header's height on the rail, so collapsing slides the icons sideways
            // rather than up. Clicking it expands the sidebar and puts the cursor in the box.
            collapsedHeader={<button
                type="button"
                class="vtc-showcase-sidebar-search-icon"
                aria-label="Search charts"
                onClick={() => {
                    this.#sidebar.setCollapsed(false)
                    ;(searchInput.querySelector("input") as HTMLInputElement | null)?.focus()
                }}><I i={searchIconKey}/></button>}
            items={buildSidebarItems("", this.#openCategories)}
            defaultCollapsed={loadSidebarCollapsed()}
            onCollapsedChange={saveSidebarCollapsed}
            defaultWidth={loadSidebarWidth()}
            onWidthChange={saveSidebarWidth}
            onToggle={() => {
                // Only what the reader has open with *no* filter applied is worth remembering:
                // while a filter is active the sidebar holds categories it forced open for them
                if (!this.#filterText.trim()) {
                    this.#openCategories = new Set(this.#sidebar.getTree().getOpenKeys())
                }
            }}/>)

        const themeToggle = <Button type="secondary" onClick={() => {
            this.#applyColorScheme(ColorScheme.getColorScheme() == "light" ? "dark" : "light")
        }}>Dark mode: {this.#darkModeLabel}</Button>

        this.#root = <div class="vtc-showcase-shell">
            {/* Navbar's own `brand` / `leading` / children slots, rather than a hand-built
                <header>: the brand sits far left, the tagline beside it via `leading`, and
                children are pushed to the right automatically. */}
            <Navbar
                class="vtc-showcase-header"
                sidebar={nav}
                menuLabel="Open the navigation"
                brand={<Link spa to="/" class="vtc-showcase-brand">velochart</Link>}
                leading={<Text type="muted">Chart showcase</Text>}>
                <a href="https://jsr.io/@velotype/velochart" class="vtc-showcase-header-link">JSR</a>
                <a href="https://velotype.github.io/" class="vtc-showcase-header-link">The Velocity Project</a>
                {themeToggle}
            </Navbar>
            <div class="vtc-showcase-body">
                {this.#sidebar}
                <main class="vtc-showcase-main">{content}</main>
            </div>
        </div>
    }

    /**
     * Re-filters the list.
     *
     * `setItems` rather than a re-render: the search box lives in the sidebar's `header`, so
     * rebuilding the whole component would destroy the input the reader is typing into.
     */
    #setFilter(text: string) {
        this.#filterText = text
        // buildSidebarItems decides what is open through defaultOpen: every surviving category
        // while a filter is active, and otherwise whatever the reader had expanded
        this.#sidebar.setItems(buildSidebarItems(text, this.#openCategories))
    }

    /**
     * Publishes the header's real height for the sidebar to stick under.
     *
     * A ResizeObserver rather than a read on scroll: it reports only when the height actually
     * changes, so nothing measures layout on an event that fires at display rate. The value is
     * rounded down - a fractional offset leaves a hairline of page showing through the seam.
     */
    #headerObserver?: ResizeObserver

    /**
     * Closes the overlay nav when a click was a navigation, and leaves it open otherwise.
     *
     * ⚠️ The distinction is the whole point, and it is finer than "a click in the sidebar". A
     * group's row *is* a `NavLink` to that category's own page, while the chevron beside it only
     * expands the group - so closing on any click would shut the panel on someone who was opening a
     * category to look inside it, which is the one thing they were most likely doing. Only a click
     * that lands inside `.vtd-sidebar-link` is a destination.
     *
     * The panel stays open on the search box for the same reason: filtering is how a reader finds
     * the link they want, not the act of following one.
     */
    #closeNavOnNavigation = (event: MouseEvent) => {
        if (!this.#sidebar.isOpen()) {
            return
        }
        const target = event.target instanceof Element ? event.target : null
        if (target?.closest(".vtd-sidebar-link")) {
            this.#sidebar.close()
        }
    }

    override mount() {
        // Capture, so the panel closes even though `NavLink`'s own handler navigates on the same
        // click - and on the sidebar's root rather than the document, so a click anywhere else on
        // the page is not this component's business
        this.#sidebar.render().addEventListener("click", this.#closeNavOnNavigation)

        const header = this.#root.querySelector(".vtc-showcase-header") as HTMLElement | null
        if (!header) {
            return
        }
        this.#headerObserver = new ResizeObserver(() => {
            this.#root.style.setProperty("--vtc-showcase-header-height", `${Math.floor(header.getBoundingClientRect().height)}px`)
        })
        this.#headerObserver.observe(header)
    }

    override unmount() {
        this.#sidebar.render().removeEventListener("click", this.#closeNavOnNavigation)
        this.#headerObserver?.disconnect()
    }

    override render(): HTMLDivElement {
        return this.#root
    }
}
