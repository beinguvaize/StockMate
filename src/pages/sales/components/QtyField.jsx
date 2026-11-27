import React, { useState, useRef, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import { allowsFraction } from '../../../lib/units';

/**
 * The quantity control on a cart line.
 *
 * What it replaces, and why each part of it was wrong on a counter:
 *
 * 1. It was an `<input type="number">`, so the browser drew its own spinner
 *    arrows INSIDE the control, between the number and the unit. The row then
 *    carried two steppers that did the same job, one of them about four pixels
 *    tall and reachable only with a mouse. On the touchscreen this app is used
 *    on, they are not reachable at all.
 *
 * 2. The − and + were 20x20 with a 9px glyph. WCAG 2.5.8 asks for 24x24 as an
 *    absolute floor; a control pressed a few hundred times a day wants more.
 *
 * 3. The field wrote through on every keystroke, and writing 0 DELETED the
 *    line. So the ordinary way to change 7 to 12 -- select, type -- could
 *    vanish the line under your hands, and a slow "1, 2" after clearing was
 *    the only safe path. A quantity is now a draft while you are typing and is
 *    committed on blur or Enter; Escape puts back what was there. Deleting a
 *    line stays the × button's job, which is the only control that says so.
 *
 * 4. 32px of width truncated anything past two digits.
 *
 * The number is a text input with inputMode, not a number input: it keeps the
 * numeric keypad on a phone and brings no spinners with it. Selecting on focus
 * is what makes the common edit -- replace the quantity -- one gesture.
 */
const QtyField = ({
  value,            // number, in the display unit
  unit,             // display unit label ('PCS', 'KG', 'packet'…)
  onStep,           // (delta: -1 | 1) => void
  onCommit,         // (text) => void — fires on blur/Enter, never per keystroke
  disabled = false,
}) => {
  const fraction = allowsFraction(unit);
  const [draft, setDraft] = useState(null);   // null = not being edited
  const inputRef = useRef(null);

  // While the field is focused the draft owns the text; when it is not, the
  // cart does. Without this a step from the + button would not show up under a
  // cursor sitting in the field.
  useEffect(() => {
    if (draft === null && inputRef.current) inputRef.current.value = String(value ?? '');
  }, [value, draft]);

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    // An empty box means "I changed my mind", not "zero". Put the old value
    // back rather than acting on a blank.
    if (text === '') return;
    onCommit(text);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); inputRef.current?.blur(); }
    if (e.key === 'Escape') { setDraft(null); inputRef.current?.blur(); }
    // The arrow keys a number input used to provide, kept deliberately.
    if (e.key === 'ArrowUp')   { e.preventDefault(); onStep(1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onStep(-1); }
  };

  // Web redesign: the phone's stepper, a grey pill with round − and +.
  const btn = 'w-7 h-7 rounded-full flex items-center justify-center shrink-0 '
    + 'text-ink-2 hover:bg-[#E8E8E7] disabled:opacity-30 '
    + 'transition-[background-color,transform] duration-(--dur-press) ease-(--ease-out) '
    + 'active:scale-[0.92] motion-reduce:active:scale-100';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center bg-well rounded-pill h-7 transition-shadow duration-(--dur-press) focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={disabled}
          aria-label="One less"
          className={btn}
        >
          <Minus size={13} strokeWidth={2.75} />
        </button>

        <input
          ref={inputRef}
          type="text"
          inputMode={fraction ? 'decimal' : 'numeric'}
          defaultValue={String(value ?? '')}
          aria-label={`Quantity${unit ? ` in ${unit}` : ''}`}
          disabled={disabled}
          onFocus={(e) => { setDraft(e.target.value); e.target.select(); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className={`${fraction ? 'w-12' : 'w-9'} h-7 text-center font-tight text-[13px] font-semibold
                      text-ink bg-transparent outline-none tabular-nums`}
        />

        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={disabled}
          aria-label="One more"
          className={btn}
        >
          <Plus size={13} strokeWidth={2.75} />
        </button>
      </div>

      {/* The unit sits under the number instead of between the number and the
          + button, where it used to read as part of the control. */}
      {String(unit ?? '').trim() && (
        <span className="text-[10.5px] font-medium text-mute leading-none">
          {String(unit).trim()}
        </span>
      )}
    </div>
  );
};

export default QtyField;
