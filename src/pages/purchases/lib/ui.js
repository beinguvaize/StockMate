/**
 * Class strings shared by the Purchases dialogs and the New Purchase page
 * (web redesign). Fields follow src/components/ui/input.jsx: 36px, hairline
 * ring, 10px corners, a 2px ink ring on focus.
 */
export const lbl = 'mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2';
export const hint = 'mt-1 block text-[12px] text-mute';
const ring = 'shadow-[inset_0_0_0_1px_var(--color-line)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';
export const field = `h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink tabular-nums placeholder:text-mute disabled:opacity-50 ${ring}`;
export const fieldSm = `h-[34px] w-full rounded-[10px] bg-surface px-2.5 text-[13px] text-ink tabular-nums placeholder:text-mute disabled:opacity-50 ${ring}`;
/** A form's own Cancel / Save row, drawn like a dialog footer. */
export const footRow = 'mt-5 flex gap-2';
