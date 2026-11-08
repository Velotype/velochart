/**
 * Every name velochart takes from velodesign, in one place - and the only module in `src/` that names
 * `@velotype/velodesign` at all.
 *
 * Interface that isn't a chart's own drawing is built from these rather than from bare elements, so it
 * looks and behaves like the rest of a page using velodesign, and a fix there reaches it here.
 *
 * It is an explicit list for the same reason `velotype.ts` is: against an external package esbuild cannot
 * enumerate the names behind `export *`. `scripts/bundle-size.ts` asserts the bundle has one import
 * statement for velodesign.
 */
export { Button, ButtonGroup, DateTimePicker, Empty, FormField, Grid, I, Icon, Popover, registerIcon, Stack, Text, TextBox } from "@velotype/velodesign"
