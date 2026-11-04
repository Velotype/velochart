/** A chart taking part in a group: what it does when another member's cursor moves */
type Member = (x: number | undefined) => void

const groups = new Map<string, Set<Member>>()

/**
 * Joins the charts sharing a `syncGroup`. They share the x value of the cursor rather than a pixel, so
 * they line up by position on the axis even when their widths and their margins differ.
 *
 * It is a module-level registry so charts need no reference to each other, and a member leaves on
 * unmount, so a group never holds on to a chart that has gone.
 */
export function joinCursorGroup(name: string, onCursor: Member): {broadcast: Member, leave: () => void} {
    const members = groups.get(name) ?? new Set<Member>()
    groups.set(name, members)
    members.add(onCursor)
    return {
        broadcast: (x) => {
            for (const member of members) {
                if (member !== onCursor) {
                    member(x)
                }
            }
        },
        leave: () => {
            members.delete(onCursor)
            if (members.size === 0) {
                groups.delete(name)
            }
        },
    }
}
