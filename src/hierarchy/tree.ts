/** A node in a `<Treemap/>` or `<SunburstChart/>`: a leaf with a `value`, or a group with `children` */
export type TreeNodeType = {
    label: string
    /** A leaf's size. A group's is the sum of its children */
    value?: number
    children?: TreeNodeType[]
    /** A CSS color for this node and everything under it (default: its top-level palette slot) */
    color?: string
}

/** A node's total: its children's, or its own value. Negatives count as nothing, since area can't be negative */
export function nodeTotal(node: TreeNodeType): number {
    if (node.children && node.children.length > 0) {
        return node.children.reduce((sum, child) => sum + nodeTotal(child), 0)
    }
    return Math.max(0, node.value ?? 0)
}

/** Every leaf with the names of its ancestors, for the hidden table a screen reader reads */
export function leafRows(nodes: TreeNodeType[], format: (value: number) => string, path: string[] = []): string[][] {
    return nodes.flatMap(node => {
        const here = [...path, node.label]
        return node.children && node.children.length > 0
            ? leafRows(node.children, format, here)
            : [[here.join(" / "), format(nodeTotal(node))]]
    })
}
