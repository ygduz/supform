import { useBuilderStore } from "@/stores/builderStore";
import { useEffect } from "react";
import { confirmDeleteContainer, findElement, pageElements } from "./model";

interface Options {
  shortcutsOpen: boolean;
  setShortcutsOpen: (fn: (open: boolean) => boolean) => void;
  closeShortcuts: () => void;
  groupingSource: string | null;
  clearGroupingSource: () => void;
}

/**
 * Global keyboard shortcuts for the builder: "?" help, Esc (close help / cancel
 * group-link / clear selection), Delete/Backspace, and the Ctrl/Cmd combos
 * (Z undo, Shift+Z redo, G group, D duplicate, A select-all).
 *
 * Lifted out of BuilderPage so the page component stays focused on render.
 */
export function useBuilderShortcuts({
  shortcutsOpen,
  setShortcutsOpen,
  closeShortcuts,
  groupingSource,
  clearGroupingSource,
}: Options) {
  const store = useBuilderStore();
  const { schema, selectedName, selectedNames, activePage } = store;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      // "?" opens the keyboard-shortcuts legend (when not typing into a field).
      if (e.key === "?" && !inText) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }

      // Esc: close the shortcuts help, cancel group-link mode, or clear selection.
      if (e.key === "Escape") {
        if (shortcutsOpen) {
          closeShortcuts();
        } else if (groupingSource) {
          clearGroupingSource();
        } else {
          store.clearSelection();
        }
        return;
      }

      // Delete / Backspace: remove selected elements (when not typing).
      if ((e.key === "Delete" || e.key === "Backspace") && !inText) {
        if (selectedNames.size > 1) {
          e.preventDefault();
          store.removeSelected();
        } else if (selectedName) {
          e.preventDefault();
          // Deleting a section takes its questions with it — confirm first.
          const el = findElement(schema, selectedName);
          if (el && !confirmDeleteContainer(el.type, el.elements?.length ?? 0)) return;
          store.remove(selectedName);
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) || inText) return;

      // Ctrl+Z / Ctrl+Shift+Z undo/redo.
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useBuilderStore.getState().redo();
        else useBuilderStore.getState().undo();
        return;
      }

      // Ctrl+G: group selection.
      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (selectedNames.size >= 2) store.groupSelected();
        return;
      }

      // Ctrl+D: duplicate selection or focused element.
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedNames.size >= 2) store.duplicateSelected();
        else if (selectedName) store.duplicate(selectedName);
        return;
      }

      // Ctrl+A: select all top-level elements on the active page.
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        const names = pageElements(schema, activePage).map((el) => el.name);
        if (names.length > 0) {
          useBuilderStore.setState({
            selectedNames: new Set(names),
            selectedName: names[0],
          });
        }
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    groupingSource,
    shortcutsOpen,
    selectedName,
    selectedNames,
    schema,
    activePage,
    store,
    setShortcutsOpen,
    closeShortcuts,
    clearGroupingSource,
  ]);
}
