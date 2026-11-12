import { useEffect, type RefObject } from 'react';

/** True while the user is typing somewhere (chat, inputs): turn shortcuts must not steal those keys. */
export function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable);
}

/**
 * Keyboard play on your turn: the first enabled action button gets focus, Tab switches between the action buttons,
 * and Enter presses the focused one (native button behaviour). Digits go to `onDigit`. Nothing happens while the
 * user types in the chat or an input, or while a dialog is open.
 */
export function useTurnKeys(active: boolean, turnKey: unknown, buttons: RefObject<HTMLButtonElement | null>[], onDigit?: (digit: number) => void) {
  useEffect(() => {
    if (!active) return;
    const enabled = () => buttons.map((b) => b.current).filter((b): b is HTMLButtonElement => !!b && !b.disabled);
    if (!isTyping(document.activeElement) && !document.querySelector('dialog[open]')) enabled()[0]?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || document.querySelector('dialog[open]') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Tab') {
        const list = enabled();
        if (!list.length) return;
        event.preventDefault();
        const index = list.indexOf(document.activeElement as HTMLButtonElement);
        list[index < 0 ? 0 : (index + (event.shiftKey ? list.length - 1 : 1)) % list.length].focus();
      } else if (onDigit && /^[0-9]$/.test(event.key)) {
        event.preventDefault();
        onDigit(Number(event.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, turnKey]); // eslint-disable-line react-hooks/exhaustive-deps -- refs and the digit handler are read live.
}
