export function trapFocus(container: HTMLElement, event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');

  if (focusables.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (event.shiftKey) {
    if (!active || active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (!active || active === last || !container.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

export function restoreFocus(node: HTMLElement | null) {
  if (!node) return;
  window.requestAnimationFrame(() => node.focus());
}
