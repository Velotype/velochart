import { Component, setStylesheet } from "@velotype/velotype"
import type { RenderableElements } from "@velotype/velotype"

import { Breadcrumbs, Heading, Link, Paragraph, Stack } from "@velotype/velodesign"
import { groupSlug, type ComponentDoc } from "../data/docs.tsx"

export type CategoryPageAttrsType = {
    group: string
    docs: ComponentDoc[]
}

let areCategoryPageStylesMounted = false

/**
 * A category overview page: every chart in one group (e.g. "Cartesian", "Radial"), each
 * with its name (linking through to the full component page) and a live preview of at least
 * its first documented example.
 */
export class CategoryPage extends Component<CategoryPageAttrsType> {
    constructor(attrs: CategoryPageAttrsType, children: RenderableElements[]) {
        super(attrs, children)
        if (!areCategoryPageStylesMounted) {
            areCategoryPageStylesMounted = true
            setStylesheet(`
.vtc-showcase-category-page{padding:2em;max-width:56em;}
/* Target Heading's own class, not the tag it happens to render */
.vtc-showcase-category-page .vtd-heading-1{margin-block:0.4em 0.2em;}
/* Paragraph carries the colour; this is the page lede's own size and spacing */
.vtc-showcase-category-page-description{font-size:1.05em;margin-block-end:2em;}
/* Stack lays the header out; this is only its spacing below */
.vtc-showcase-category-entry-header{margin-block-end:0.5em;}
.vtc-showcase-category-entry-header .vtd-heading{margin:0;}
.vtc-showcase-category-entry-link{color:inherit;text-decoration:none;font-size:0.9em;}
.vtc-showcase-category-entry-link:hover{color:var(--primary-8);}
.vtc-showcase-category-entry-description{font-size:0.9em;margin-block-end:0.6em;}
.vtc-showcase-example-preview{
border:1px solid var(--background-4);
border-radius:0.5rem;
padding:2em;
display:flex;
align-items:center;
min-height:3em;
background-image:radial-gradient(color-mix(in srgb, var(--background-4) 35%, transparent) 1px, transparent 1px);
background-size:16px 16px;
}
`, "velochart-showcase/CategoryPage")
        }
    }

    override render(attrs: CategoryPageAttrsType): RenderableElements {
        return <div class="vtc-showcase-category-page">
            <Breadcrumbs spa items={[{label: "Home", to: "/"}, {label: attrs.group}]}/>
            <Heading level={1}>{attrs.group}</Heading>
            <Paragraph type="muted">{attrs.docs.length} chart{attrs.docs.length == 1 ? "" : "s"} in this category.</Paragraph>

            <Stack direction="column" gap="xl">
                {attrs.docs.map(doc => {
                    // `example.node` is a factory (see the ExampleDoc doc comment), so calling
                    // it here builds this page's own independent instance rather than reusing
                    // one shared with ComponentPage - each place an example is shown gets one
                    // that's actually mounted where it's being displayed.
                    const preview = doc.examples.length > 0 ? doc.examples[0].node() : null
                    return <div>
                        <Stack justify="between" align="center" class="vtc-showcase-category-entry-header">
                            <Heading level={2}>{doc.name}</Heading>
                            <Link spa to={`/components/${doc.slug}`} class="vtc-showcase-category-entry-link">View details →</Link>
                        </Stack>
                        <Paragraph type="muted">{doc.description}</Paragraph>
                        <div class="vtc-showcase-example-preview">{preview}</div>
                    </div>
                })}
            </Stack>
        </div>
    }
}

/** URL for a category's overview page */
export function categoryPageUrl(group: string): string {
    return `/category/${groupSlug(group)}`
}
