import { useEffect } from 'react';

let activeLocksCount = 0;
let originalOverflow = '';
let originalPaddingRight = '';

/**
 * Custom hook to lock body scrolling when a modal, overlay, or dialog is open.
 * Uses a global reference counter so multiple modals or React StrictMode
 * never corrupt original body styles or leave the page permanently locked.
 */
export function useBodyScrollLock(isOpen = false) {
  useEffect(() => {
    if (!isOpen) return;

    if (activeLocksCount === 0) {
      originalOverflow = document.body.style.overflow;
      originalPaddingRight = document.body.style.paddingRight;

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.overflow = 'hidden';
    }
    activeLocksCount += 1;

    return () => {
      activeLocksCount = Math.max(0, activeLocksCount - 1);
      if (activeLocksCount === 0) {
        document.body.style.overflow = originalOverflow || '';
        document.body.style.paddingRight = originalPaddingRight || '';
        originalOverflow = '';
        originalPaddingRight = '';
      }
    };
  }, [isOpen]);
}
