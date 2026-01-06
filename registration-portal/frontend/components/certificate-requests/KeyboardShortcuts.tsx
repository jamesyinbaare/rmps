"use client";

import { useEffect } from "react";

interface KeyboardShortcutsProps {
  onSearchFocus?: () => void;
  onQuickAssign?: () => void;
  onQuickComment?: () => void;
  onCloseDialog?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onSearchFocus,
  onQuickAssign,
  onQuickComment,
  onCloseDialog,
  enabled = true,
}: KeyboardShortcutsProps) {

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs, textareas, or contenteditable elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl/Cmd + K - Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onSearchFocus?.();
        return;
      }

      // Ctrl/Cmd + F - Focus search (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        onSearchFocus?.();
        return;
      }

      // Esc - Close dialogs
      if (e.key === "Escape") {
        onCloseDialog?.();
        return;
      }

      // Ctrl/Cmd + A - Quick assign (only if not in input)
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && !e.shiftKey) {
        e.preventDefault();
        onQuickAssign?.();
        return;
      }

      // Ctrl/Cmd + M - Quick comment
      if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        e.preventDefault();
        onQuickComment?.();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, onSearchFocus, onQuickAssign, onQuickComment, onCloseDialog]);
}
