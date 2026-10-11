import { useLayoutEffect, useRef } from 'react';

/** Presentation-only behavior for custom dialogs. Callers retain their close
 * and busy contracts. Existing inert/ARIA state is restored exactly on cleanup. */
export function useAccessibleModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const path = window.location.pathname;
    const hidden: Array<{ el: HTMLElement; inert: boolean; aria: string | null }> = [];
    for (let branch: HTMLElement = dialog; branch.parentElement; branch = branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement) || ['STYLE', 'SCRIPT', 'LINK'].includes(sibling.tagName)) continue;
        hidden.push({ el: sibling, inert: sibling.inert, aria: sibling.getAttribute('aria-hidden') });
        sibling.inert = true;
        sibling.setAttribute('aria-hidden', 'true');
      }
    }
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]'))
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert],[hidden],[aria-hidden="true"]') && getComputedStyle(el).visibility !== 'hidden'
        && !Array.from((function* () { for (let p: HTMLElement | null = el; p && p !== dialog; p = p.parentElement) yield p; })()).some(p => getComputedStyle(p).display === 'none'));
    (controls()[0] ?? dialog).focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0] ?? dialog, last = items.at(-1) ?? dialog;
      if (!dialog.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    };
    const contain = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) (controls()[0] ?? dialog).focus();
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', contain);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', contain);
      for (const { el, inert, aria } of hidden.reverse()) {
        el.inert = inert;
        if (aria === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', aria);
      }
      if (window.location.pathname === path && origin?.isConnected && !origin.closest('[inert],[hidden],[aria-hidden="true"]')) origin.focus();
    };
  }, [open]);
  return ref;
}
