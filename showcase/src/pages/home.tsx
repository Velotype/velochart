import { Component, setStylesheet } from "@velotype/velotype"
import type { EmptyAttrs } from "@velotype/velotype"

import { Badge, Button, Card, Grid, Heading, History, I, Paragraph, Stack, Statistic, Text } from "@velotype/velodesign"
import { componentDocs, groupedDocs } from "../data/docs.tsx"
import { bundleSize } from "../data/bundle-size.ts"
import { categoryPageUrl } from "./category-page.tsx"
import { categoryIconKey } from "../data/category-icons.ts"

let areHomeStylesMounted = false

/** The landing page: hero, library stats, and a grid of category cards linking into the sidebar's groups */
export class HomePage extends Component<EmptyAttrs> {
    override render() {
        if (!areHomeStylesMounted) {
            areHomeStylesMounted = true
            setStylesheet(`
.vtc-showcase-hero{
padding:4em 2em 3em 2em;
text-align:center;
border-block-end:1px solid var(--background-4);
}
/* Stack handles the row itself; this is the section's own framing */
.vtc-showcase-stats{padding:2em;border-block-end:1px solid var(--background-4);}
/* The hero's prose is centred and measured - a job for the page, not for Paragraph */
.vtc-showcase-hero .vtd-paragraph{font-size:1.15em;max-width:34em;margin:0 auto 1.5em auto;}
.vtc-showcase-section{padding:2em;}
.vtc-showcase-section .vtd-heading-2{margin-block-end:1em;}
.vtc-showcase-category-card{cursor:pointer;}
.vtc-showcase-category-icon{font-size:1.3em;color:var(--primary-7);}
.vtc-showcase-category-card:hover .vtd-card{border-color:var(--primary-6);}
`, "velochart-showcase/HomePage")
        }

        const groups = groupedDocs()

        return <div>
            <section class="vtc-showcase-hero">
                <Heading level={1}>velochart</Heading>
                <Paragraph type="muted">A chart library for Velotype, drawn in SVG at the container's real pixel width and themed
                    from the same CSS custom properties as velodesign - {componentDocs.length} charts
                    across {groups.length} categories.</Paragraph>
                <Stack justify="center" gap="lg">
                    <Button type="primary" onClick={() => History.changeLocation(`/components/${componentDocs[0].slug}`)}>Browse charts</Button>
                </Stack>
            </section>

            <section class="vtc-showcase-stats">
                <Stack justify="center" gap="xl" align="center">
                    <Statistic title="Charts" value={componentDocs.length}/>
                    <Statistic title="Categories" value={groups.length}/>
                    {/* Measured, not claimed: this page's own build task regenerates the figure first.
                        ownGzip, not gzip: the second has velotype folded in, and a consumer does not
                        pay that to velochart when velotype is already in their app */}
                    <Statistic title="Whole library, gzipped" value={(bundleSize.ownGzip / 1024).toFixed(1)} suffix={<Text type="muted"> KB</Text>}/>
                </Stack>
            </section>

            <section class="vtc-showcase-section">
                <Heading level={2}>Browse by category</Heading>
                <Grid minColumnWidth="15em" gap="md" align="start">
                    {groups.map(bucket => <div class="vtc-showcase-category-card" onClick={() => History.changeLocation(categoryPageUrl(bucket.group))}>
                        <Card header={<Stack inline gap="sm" align="center">
                            <I i={categoryIconKey(bucket.group)} class="vtc-showcase-category-icon"/>
                            {bucket.group}
                            <Badge type="neutral">{bucket.docs.length}</Badge>
                        </Stack>}>
                            <Text type="muted">{bucket.docs.map(doc => doc.name).join(", ")}</Text>
                        </Card>
                    </div>)}
                </Grid>
            </section>
        </div>
    }
}
