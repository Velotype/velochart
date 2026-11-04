import { Component, setStylesheet } from "@velotype/velotype"
import type { RenderableElements } from "@velotype/velotype"

import { Badge, Breadcrumbs, CodeBlock, Heading, Link, Paragraph, Stack, Table, TableOfContents, Text } from "@velotype/velodesign"
import type { TableColumnType } from "@velotype/velodesign"
import type { TableOfContentsItemType } from "@velotype/velodesign"
import { componentDocs, type ComponentDoc, type AttrDoc, type MethodDoc, type TypeDoc } from "../data/docs.tsx"
import { categoryPageUrl } from "./category-page.tsx"

export type ComponentPageAttrsType = {
    doc: ComponentDoc
}

let areComponentPageStylesMounted = false

/**
 * A single component's documentation page: breadcrumb, title, description, a gallery of
 * labeled example variants (the different common states/uses of the component - e.g. Button's
 * "Types" and "Disabled" examples), an attribute reference table, and prev/next navigation through
 * the full component list.
 */
/**
 * Splits a dotted path so it can wrap at its dots.
 *
 * `ModalThemeOptions.cancelSymbol` has no space in it, so a narrow column breaks it wherever the
 * line happens to end - "ModalThem / eOptions.c / ancelSymbo / l". A `<wbr/>` after each dot gives
 * the browser a break opportunity it prefers, and unlike a zero-width space it adds no character
 * to what gets copied out of the cell.
 */
function breakAtDots(value: string): RenderableElements {
    const parts = value.split(".")
    if (parts.length < 2) {
        return value
    }
    return <span>{parts.map((part, index) => index == 0 ? part : <span>.<wbr/>{part}</span>)}</span>
}

/**
 * The columns an attribute table renders with.
 *
 * Shared by the Attributes table and by each named type's field table, so the two read identically
 * - a field of `AccordionItemType` is the same kind of row as an attribute of `Accordion`, and
 * documenting it in a table that looked different would suggest otherwise.
 */
function attrColumns(nameHeader: string): TableColumnType<AttrDoc>[] {
    return [
        {key: "name", header: nameHeader, width: "23%", render: (row: AttrDoc) =>
            // Only required is marked. Optional is the default state - it is how every attrs type
            // is written (`foo?: string`), so a marker on those would be noise the eye must filter.
            row.required
                ? <Stack inline gap="xs" align="center"><Text>{row.name}</Text><Badge type="warning">required</Badge></Stack>
                : <Text>{row.name}</Text>},
        {key: "type", header: "Type", width: "22%", render: (row: AttrDoc) => row.type},
        {key: "default", header: "Default", width: "15%", render: (row: AttrDoc) => {
            // One representation for "there is no default", whatever the reason - the attr is
            // required, or the component deliberately falls back to nothing. Those were once an em
            // dash and the word "none" separately, which read as a distinction to decode.
            if (!row.defaultValue) {
                return <Text type="muted">—</Text>
            }
            // A conditional default ("true for a row, never for a column") is prose. Monospacing
            // it would claim it is something you could pass.
            const isLiteral = !/\s/.test(row.defaultValue) || /^\[.*\]$/.test(row.defaultValue)
            return isLiteral ? <Text code>{breakAtDots(row.defaultValue)}</Text> : <Text>{row.defaultValue}</Text>
        }},
        {key: "description", header: "Description", render: (row: AttrDoc) => row.description},
    ]
}

/** The id for a named type's own section */
function typeId(name: string): string {
    return "type-" + name.toLowerCase()
}

/** The id for a theme-option object's own section */
function themeOptionId(name: string): string {
    return "theme-" + name.toLowerCase()
}

/**
 * A named object rendered as a heading, an optional line of prose, and a field table.
 *
 * Shared by the Types and Theme options sections: both document a named shape with the same
 * columns as an attribute table, and rendering them differently would suggest they were different
 * kinds of thing.
 */
function namedShape(shape: TypeDoc, id: string): RenderableElements {
    return <div class="vtc-showcase-type">
        <Heading level={3} id={id}><Text code>{shape.name}</Text></Heading>
        {shape.description ? <Paragraph type="muted">{shape.description}</Paragraph> : null}
        <Table<AttrDoc> columns={attrColumns("Field")} rows={shape.fields}/>
    </div>
}

/** A stable id for an example, from its label - the anchor the table of contents points at */
function exampleId(label: string): string {
    return "example-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/**
 * The page's sections, in the order they are rendered.
 *
 * Built from the same data the page renders rather than scraped back out of the DOM, so the two
 * cannot disagree - which is exactly why `TableOfContents` takes items rather than querying for
 * headings itself.
 */
function tocItems(doc: ComponentDoc): TableOfContentsItemType[] {
    const items: TableOfContentsItemType[] = []
    if (doc.signature) {
        items.push({id: "signature", label: "Signature", level: 1})
    }
    if (doc.examples.length > 0) {
        items.push({id: "examples", label: "Examples", level: 1})
        for (const example of doc.examples) {
            items.push({id: exampleId(example.label), label: example.label, level: 2})
        }
    }
    if (doc.attrs.length > 0) {
        items.push({id: "attributes", label: doc.kind == "function" ? "Parameters" : "Attributes", level: 1})
    }
    if (doc.types && doc.types.length > 0) {
        items.push({id: "types", label: "Types", level: 1})
        for (const type of doc.types) {
            items.push({id: typeId(type.name), label: type.name, level: 2})
        }
    }
    if (doc.themeOptions && doc.themeOptions.length > 0) {
        items.push({id: "theme-options", label: "Theme options", level: 1})
        for (const option of doc.themeOptions) {
            items.push({id: themeOptionId(option.name), label: option.name, level: 2})
        }
    }
    if (doc.methods && doc.methods.length > 0) {
        items.push({id: "methods", label: "Methods", level: 1})
    }
    if (doc.children) {
        items.push({id: "children", label: "Children", level: 1})
    }
    return items
}

export class ComponentPage extends Component<ComponentPageAttrsType> {
    constructor(attrs: ComponentPageAttrsType, children: RenderableElements[]) {
        super(attrs, children)
        if (!areComponentPageStylesMounted) {
            areComponentPageStylesMounted = true
            setStylesheet(`
/*
 * Wider than the 56em the other pages use, because this one is carrying a four-column reference
 * table rather than prose. At 56em the Attribute column could not hold "confirmButtonChildren"
 * without breaking it mid-word. The lede paragraph below is capped separately so the prose itself
 * still reads at a sane measure.
 */
/*
 * Content plus a sticky table of contents. The nav hides rather than wrapping under the content
 * on a narrow viewport: it is a shortcut to sections the reader can already scroll to, so losing
 * it costs nothing, where a full-width copy of it above the page would cost a screenful.
 */
.vtc-showcase-doc-layout{display:flex;align-items:flex-start;gap:2em;}
.vtc-showcase-doc-toc{
width:14em;
flex-shrink:0;
position:sticky;
/* Clears the sticky header, matching the sidebar */
top:calc(53px + 2em);
padding-block-end:2em;
}
@media (max-width:75em){
.vtc-showcase-doc-toc{display:none;}
}
/*
 * .vtc-showcase-doc and .vtc-showcase-doc-description are the shared page frame and live in
 * AppShell's stylesheet - the theme builder uses them too, and a page must not depend on some
 * other page having been visited first to get its own padding.
 */
.vtc-showcase-examples{margin-block-end:2em;}
/*
 * The example labels are real <h3>s for the sake of the outline, but they are captions rather than
 * section titles - this puts them back to caption weight. Needs to out-specify .vtd-heading-3.
 */
.vtc-showcase-doc .vtc-showcase-example-label{
font-size:0.85em;
font-weight:bold;
color:var(--background-6);
margin-block:0 0.5em;
}
.vtc-showcase-example-preview{
border:1px solid var(--background-4);
/* Square off the edge the code block butts against - the two read as one unit */
border-radius:0.5rem 0.5rem 0 0;
border-block-end:none;
padding:2em;
display:flex;
align-items:center;
min-height:3em;
background-image:radial-gradient(color-mix(in srgb, var(--background-4) 35%, transparent) 1px, transparent 1px);
background-size:16px 16px;
}
/* CodeBlock draws the panel; this only joins it to the preview sitting directly above */
.vtc-showcase-example-code{border-radius:0 0 0.5rem 0.5rem;}
.vtc-showcase-attrs{margin-block-end:2em;}
.vtc-showcase-methods{margin-block-end:2em;}
.vtc-showcase-types{margin-block-end:2em;}
.vtc-showcase-type{margin-block-end:1.5em;}
/* The type name is a heading, but it is an identifier - keep it at body size and monospaced */
.vtc-showcase-doc .vtc-showcase-type .vtd-heading-3{font-size:1em;margin-block:0 0.4em;}
.vtc-showcase-children{margin-block-end:2em;}
.vtc-showcase-signature{margin-block-end:2em;}
.vtc-showcase-page-nav{border-block-start:1px solid var(--background-4);padding-block-start:1.5em;}
.vtc-showcase-page-nav .vtd-link{color:inherit;text-decoration:none;font-weight:bold;}
.vtc-showcase-page-nav .vtd-link:hover{color:var(--primary-8);}
`, "velochart-showcase/ComponentPage")
        }
    }

    override render(attrs: ComponentPageAttrsType): RenderableElements {
        const doc = attrs.doc
        const index = componentDocs.findIndex(candidate => candidate.slug == doc.slug)
        const prev = index > 0 ? componentDocs[index - 1] : undefined
        const next = index >= 0 && index < componentDocs.length - 1 ? componentDocs[index + 1] : undefined

        const sections = tocItems(doc)

        return <div class="vtc-showcase-doc-layout">
            <div class="vtc-showcase-doc">
            {/* The category crumb links to its own page - a trail whose middle step is dead text
                leaves the reader no way back up to the rest of the category */}
            <Breadcrumbs spa items={[
                {label: "Home", to: "/"},
                {label: doc.group, to: categoryPageUrl(doc.group)},
                {label: doc.name},
            ]}/>
            <Stack align="center" gap="sm">
                <Heading level={1}>{doc.name}</Heading>
                {doc.kind == "function" ? <Badge type="secondary">Function</Badge> : null}
            </Stack>
            <Paragraph type="muted" class="vtc-showcase-doc-description">{doc.description}</Paragraph>

            {doc.signature ? <div class="vtc-showcase-signature">
                <Heading level={2} id="signature">Signature</Heading>
                <CodeBlock code={doc.signature} ariaLabel={`How to call ${doc.name}`}/>
            </div> : null}

            {doc.examples.length > 0 ? <Heading level={2} id="examples">Examples</Heading> : null}
            {doc.examples.length > 0 ? <Stack direction="column" gap="lg" class="vtc-showcase-examples">
                {doc.examples.map(example => <div>
                    {/* A real heading, so the document outline cascades h1 > h2 > h3 rather than
                        leaving each example's label as loose text the outline cannot see */}
                    <Heading level={3} id={exampleId(example.label)} class="vtc-showcase-example-label">{example.label}</Heading>
                    <div class="vtc-showcase-example-preview">{example.node()}</div>
                    <CodeBlock
                        class="vtc-showcase-example-code"
                        showLineNumbers
                        wrap
                        code={example.code}
                        ariaLabel={`${doc.name} - ${example.label} source`}/>
                </div>)}
            </Stack> : null}

            {doc.attrs.length > 0 ? <div class="vtc-showcase-attrs">
                <Heading level={2} id="attributes">{doc.kind == "function" ? "Parameters" : "Attributes"}</Heading>
                <Table<AttrDoc>
                    columns={attrColumns(doc.kind == "function" ? "Parameter" : "Attribute")}
                    rows={doc.attrs}/>
            </div> : null}

            {doc.types && doc.types.length > 0 ? <div class="vtc-showcase-types">
                <Heading level={2} id="types">Types</Heading>
                <Paragraph type="muted">Shapes this component's attributes refer to by name.</Paragraph>
                {doc.types.map(type => namedShape(type, typeId(type.name)))}
            </div> : null}

            {doc.themeOptions && doc.themeOptions.length > 0 ? <div class="vtc-showcase-types">
                <Heading level={2} id="theme-options">Theme options</Heading>
                <Paragraph type="muted">
                    An exported, mutable object holding the palette the charts draw from and the
                    glyph they fall back to. A field is read when a chart draws, not resolved from
                    CSS, so assign to it while your app is starting up, before the first chart exists:
                    velochart never watches it and will not redraw anything when one changes. The
                    matching attrs (shown above) still override a single instance.
                </Paragraph>
                {doc.themeOptions.map(option => namedShape(option, themeOptionId(option.name)))}
            </div> : null}

            {doc.methods && doc.methods.length > 0 ? <div class="vtc-showcase-methods">
                <Heading level={2} id="methods">Methods</Heading>
                <Paragraph type="muted">Called on the component, not passed to it.</Paragraph>
                <Table<MethodDoc>
                    columns={[
                        {key: "name", header: "Method", width: "25%", render: (row: MethodDoc) => <Text code>{row.name}</Text>},
                        {key: "description", header: "Description", render: (row: MethodDoc) => row.description},
                    ]}
                    rows={doc.methods}/>
            </div> : null}

            {doc.children ? <div class="vtc-showcase-children">
                <Heading level={2} id="children">Children</Heading>
                <Paragraph>{doc.children}</Paragraph>
            </div> : null}

            <Stack justify="between" class="vtc-showcase-page-nav">
                {prev ? <Link spa to={`/components/${prev.slug}`}>← {prev.name}</Link> : <span/>}
                {next ? <Link spa to={`/components/${next.slug}`}>{next.name} →</Link> : <span/>}
            </Stack>
            </div>

            {sections.length > 0 ? <div class="vtc-showcase-doc-toc">
                <TableOfContents
                    header="On this page"
                    ariaLabel="On this page"
                    topOffset={60}
                    items={sections}/>
            </div> : null}
        </div>
    }
}
