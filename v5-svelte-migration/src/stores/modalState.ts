import { writable } from 'svelte/store';

export const activeModal = writable<string | null>(null);

export function openModal(modalId: string) {
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
}
