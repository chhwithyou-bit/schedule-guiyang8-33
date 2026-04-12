import { get, writable } from 'svelte/store';

export const activeModal = writable<string | null>(null);

let lastModalTrigger: HTMLElement | null = null;

function resolveActiveElement() {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function openModal(modalId: string) {
  if (!get(activeModal)) {
    lastModalTrigger = resolveActiveElement();
  }

  activeModal.set(modalId);
  if (typeof window !== 'undefined') {
    document.body.classList.add('modal-open');
  }
}

export function closeModal() {
  activeModal.set(null);
  if (typeof window !== 'undefined') {
    document.body.classList.remove('modal-open');
  }

  const nextFocusTarget = lastModalTrigger;
  lastModalTrigger = null;

  if (nextFocusTarget && typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      if (nextFocusTarget.isConnected) {
        nextFocusTarget.focus();
      }
    });
  }
}
