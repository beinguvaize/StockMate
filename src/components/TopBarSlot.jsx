import React, { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A page's own bit of the shell's top bar (web redesign).
 *
 * The top bar belongs to the shell, but some pages carry a figure or two that
 * the approved design puts up there, beside the title (Sales: "Today ₹18,420
 * · 24 bills · avg ₹801"). Rather than the shell learning about each page,
 * it offers one empty spot and a page fills it:
 *
 *   <TopBarSlot>…</TopBarSlot>      in the page
 *   <TopBarSlotTarget />            in the shell's top bar (and the kiosk bar)
 *
 * The content is portalled, so it stays in the page's React tree (its state,
 * its context) and disappears when the page unmounts. With no target on
 * screen it renders nothing.
 */
const SlotContext = createContext({ node: null, setNode: () => {} });

export function TopBarSlotProvider({ children }) {
  const [node, setNode] = useState(null);
  return <SlotContext.Provider value={{ node, setNode }}>{children}</SlotContext.Provider>;
}

export function TopBarSlotTarget({ className }) {
  const { setNode } = useContext(SlotContext);
  return <div ref={setNode} className={className} />;
}

export default function TopBarSlot({ children }) {
  const { node } = useContext(SlotContext);
  return node ? createPortal(children, node) : null;
}
