import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { pageElements } from "./model";
import { ELEMENT_PALETTE } from "./palette";

type BuilderMode = "build" | "design" | "share" | "results";

interface Command {
  id: string;
  section: "Actions" | "Jump to question" | "Add a question";
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

/**
 * ⌘K / Ctrl+K command palette: form-level actions, jump-to-question across every page,
 * and add-a-question-by-type-name — all in one searchable list. The global keyboard
 * shortcut lives in useBuilderShortcuts (alongside the other Ctrl/Cmd combos); a top-bar
 * button is the second entry point — both just flip the `open` prop, same as every other
 * dialog in the builder (PreviewModal, ShareDialog, etc).
 */
export function CommandPalette({
  open,
  onClose,
  onOpenPreview,
  onToggleTheme,
  onSetMode,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPreview: () => void;
  onToggleTheme: () => void;
  onSetMode: (mode: BuilderMode) => void;
}) {
  const store = useBuilderStore();
  const { schema, activePage, formId } = store;
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // Autofocus the search box the moment the palette opens.
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const commands = useMemo(() => {
    const list: Command[] = [];

    // ── Actions ──────────────────────────────────────────────────────
    list.push({
      id: "action:preview",
      section: "Actions",
      icon: "▶",
      label: "Open live preview",
      run: onOpenPreview,
    });
    list.push({
      id: "action:theme",
      section: "Actions",
      icon: "◐",
      label: "Toggle light / dark theme",
      run: onToggleTheme,
    });
    const currentPageNames: string[] = [];
    const collect = (els: Element[]) => {
      for (const el of els) {
        if (el.elements) collect(el.elements);
        else currentPageNames.push(el.name);
      }
    };
    collect(pageElements(schema, activePage));
    const allCompact =
      currentPageNames.length > 0 && currentPageNames.every((n) => store.compactNames.has(n));
    list.push({
      id: "action:compact",
      section: "Actions",
      icon: allCompact ? "▾" : "▸",
      label: allCompact ? "Expand all questions" : "Collapse all questions",
      hint: "Current page",
      run: () => (allCompact ? store.clearCompact() : store.compactAll(currentPageNames)),
    });
    list.push({
      id: "action:addpage",
      section: "Actions",
      icon: "＋",
      label: "Add a new page",
      run: store.addPage,
    });
    const modes: { mode: BuilderMode; label: string; icon: string; enabled: boolean }[] = [
      { mode: "build", label: "Jump to Build", icon: "📋", enabled: true },
      { mode: "design", label: "Jump to Design", icon: "🎨", enabled: true },
      { mode: "share", label: "Jump to Share", icon: "🔗", enabled: true },
      { mode: "results", label: "Jump to Results", icon: "📊", enabled: !!formId },
    ];
    for (const m of modes) {
      if (!m.enabled) continue;
      list.push({
        id: `action:mode:${m.mode}`,
        section: "Actions",
        icon: m.icon,
        label: m.label,
        run: () => onSetMode(m.mode),
      });
    }

    // ── Jump to question (every named field, across every page) ────────
    schema.pages.forEach((page, pageIndex) => {
      const walk = (els: Element[]) => {
        for (const el of els) {
          list.push({
            id: `jump:${el.name}`,
            section: "Jump to question",
            icon: "→",
            label: localize(el.label) || el.name,
            hint: schema.pages.length > 1 ? `Page ${pageIndex + 1}` : undefined,
            run: () => {
              store.setActivePage(pageIndex);
              store.select(el.name);
            },
          });
          if (el.elements) walk(el.elements);
        }
      };
      walk(page.elements);
    });

    // ── Add a question by type name — only once the user is searching, so the palette
    // doesn't open onto a wall of 30 types by default. ──────────────────────────────
    if (query.trim()) {
      for (const item of ELEMENT_PALETTE) {
        list.push({
          id: `add:${item.type}`,
          section: "Add a question",
          icon: item.icon,
          label: `Add: ${item.label}`,
          run: () => {
            store.addAt(
              item.type,
              { pageIndex: activePage },
              pageElements(schema, activePage).length,
            );
          },
        });
      }
    }

    return list;
  }, [schema, activePage, formId, query, store, onOpenPreview, onToggleTheme, onSetMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((c) => c.section !== "Add a question");
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Group while preserving section order (Actions, Jump to question, Add a question).
  const sections = useMemo(() => {
    const order: Command["section"][] = ["Actions", "Jump to question", "Add a question"];
    return order
      .map((section) => ({ section, items: filtered.filter((c) => c.section === section) }))
      .filter((s) => s.items.length > 0);
  }, [filtered]);

  function run(cmd: Command) {
    cmd.run();
    onClose();
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[highlight];
      if (cmd) run(cmd);
    }
  }

  if (!open) return null;

  let rowIndex = -1;

  return (
    <div className="modal-backdrop cmdk-backdrop">
      <button
        type="button"
        className="modal-backdrop-close"
        aria-label="Close command palette"
        onClick={onClose}
      />
      <div className="cmdk">
        <input
          ref={inputRef}
          type="text"
          className="cmdk-input"
          placeholder="Search commands, questions, or field types…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onInputKeyDown}
        />
        <div className="cmdk-list" role="menu">
          {sections.length === 0 && <p className="cmdk-empty muted">No matches.</p>}
          {sections.map((s) => (
            <div key={s.section} className="cmdk-section">
              <span className="cmdk-section-label">{s.section}</span>
              {s.items.map((cmd) => {
                rowIndex += 1;
                const idx = rowIndex;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    role="menuitem"
                    className={idx === highlight ? "cmdk-item active" : "cmdk-item"}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => run(cmd)}
                  >
                    <span className="cmdk-item-icon" aria-hidden="true">
                      {cmd.icon}
                    </span>
                    <span className="cmdk-item-label">{cmd.label}</span>
                    {cmd.hint && <span className="cmdk-item-hint">{cmd.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
