/** The part of a view that charts in a group share: their x range, or nothing when fully zoomed out */
export type SyncedView = {xMin: number, xMax: number} | undefined

/** A chart taking part in a group: what it does when another member moves */
type Member = {
    cursor: (x: number | undefined) => void
    view: (view: SyncedView) => void
}

const groups = new Map<string, Set<Member>>()

/**
 * Joins the charts sharing a `syncGroup`. They share x values rather than pixels, so they line up by
 * position on the axis even when their widths and their margins differ.
 *
 * It is a module-level registry so charts need no reference to each other, and a member leaves on
 * unmount, so a group never holds on to a chart that has gone.
 */
export function joinSyncGroup(name: string, self: Member): {
    broadcastCursor: (x: number | undefined) => void
    broadcastView: (view: SyncedView) => void
    leave: () => void
} {
    const members = groups.get(name) ?? new Set<Member>()
    groups.set(name, members)
    members.add(self)
    const others = (call: (member: Member) => void) => {
        for (const member of members) {
            if (member !== self) {
                call(member)
            }
        }
    }
    return {
        broadcastCursor: (x) => others(member => member.cursor(x)),
        broadcastView: (view) => others(member => member.view(view)),
        leave: () => {
            members.delete(self)
            if (members.size === 0) {
                groups.delete(name)
            }
        },
    }
}
