"use client";
import { useEffect, useRef } from "react";

const stack: HTMLElement[] = [];
const selector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])';

/** Only the topmost dialog handles Escape/focus; nested evidence restores its opener. */
export function useDialogFocus(onClose?: () => void) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const enabled = Boolean(onClose);
  useEffect(() => {
    const dialog = ref.current;
    if (!enabled || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    stack.push(dialog);
    document.body.style.overflow = "hidden";
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector))
      .filter(item => item.tabIndex >= 0 && item.getClientRects().length && !item.closest('[inert]'));
    const focusFirst = () => (items()[0] ?? dialog).focus();
    focusFirst();
    function keydown(event: KeyboardEvent) {
      if (stack.at(-1) !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current?.(); }
      if (event.key !== "Tab") return;
      const available = items();
      const first = available[0], last = available.at(-1);
      if (!first) { event.preventDefault(); dialog!.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last!.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    function focusin(event: FocusEvent) {
      if (stack.at(-1) === dialog && !dialog!.contains(event.target as Node)) focusFirst();
    }
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin);
      const index = stack.indexOf(dialog);
      if (index >= 0) stack.splice(index, 1);
      document.body.style.overflow = stack.length ? "hidden" : overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [enabled]);
  return ref;
}
