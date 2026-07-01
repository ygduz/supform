import { api } from "@/api/client";
import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import type { DropLocation } from "./BuilderCanvas";
import { CanvasList } from "./CanvasList";
import { CardPreview } from "./CardPreview";
import { lintForm } from "./lint";
import { confirmDeleteContainer, isContainerType } from "./model";

/** Tooltip text for the ⚡ badge: which rules this question carries. */
function logicSummary(element: Element): string {
  const parts: string[] = [];
  if (element.visibleIf) parts.push(`Visible if: ${element.visibleIf}`);
  if (element.requiredIf) parts.push(`Required if: ${element.requiredIf}`);
  if (element.enableIf) parts.push(`Enabled if: ${element.enableIf}`);
  return parts.join("\n");
}

interface Props {
  element: Element;
  index: number;
  count: number;
  location: DropLocation;
  selected: boolean;
  inSelection: boolean;
  multiSelect: boolean;
  selectedName: string | null;
  selectedNames: Set<string>;
  activeDragId: string | null;
  overDragId: string | null;
  groupingSource: string | null;
  onGroupLink: (name: string) => void;
}

export function ElementCard({
  element,
  index,
  count,
  location,
  selected,
  inSelection,
  multiSelect,
  selectedName,
  selectedNames,
  activeDragId,
  overDragId,
  groupingSource,
  onGroupLink,
}: Props) {
  const {
    select,
    selectToggle,
    selectRange,
    update,
    moveBy,
    duplicate,
    remove,
    ungroup,
    clearSelection,
  } = useBuilderStore();
  const collapsed = useBuilderStore((s) => s.collapsedNames.has(element.name));
  const toggleCollapsed = useBuilderStore((s) => s.toggleCollapsed);
  const compact = useBuilderStore((s) => s.compactNames.has(element.name));
  const toggleCompact = useBuilderStore((s) => s.toggleCompact);
  const schema = useBuilderStore((s) => s.schema);
  const elNotes = lintForm(schema).filter((n) => n.elementName === element.name);
  const connectingFrom = useBuilderStore((s) => s.connectingFrom);
  const startConnect = useBuilderStore((s) => s.startConnect);
  const requestConnect = useBuilderStore((s) => s.requestConnect);
  const cancelConnect = useBuilderStore((s) => s.cancelConnect);
  const groupCue = useBuilderStore(
    (s) => s.dropMode === "group" && s.dropTargetName === element.name,
  );
  const container = isContainerType(element.type);
  const childCount = element.elements?.length ?? 0;

  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: element.name,
    data: { location },
    // Block sortable drag when in group-link mode so clicks work cleanly.
    disabled: groupingSource !== null,
  });

  // Scroll the card into view when it becomes selected (e.g. from the Map panel).
  // `nearest` keeps the canvas still when the card is already visible.
  const nodeRef = useRef<HTMLLIElement | null>(null);
  const setRefs = (node: HTMLLIElement | null) => {
    nodeRef.current = node;
    setNodeRef(node);
  };
  useEffect(() => {
    if (selected && !isDragging) {
      nodeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected, isDragging]);

  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowOpen]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isGroupTarget = groupingSource !== null && groupingSource !== element.name;
  // Inline editing is on for the focused card outside of multi-select / link modes.
  const editing = selected && !multiSelect && groupingSource === null;

  const cls = [
    "el-card",
    selected && !multiSelect ? "selected" : "",
    inSelection ? "in-selection" : "",
    isDragging ? "dragging" : "",
    overDragId === element.name && activeDragId && activeDragId !== element.name
      ? "drop-target"
      : "",
    isGroupTarget ? "group-target" : "",
    groupCue ? "group-cue" : "",
    compact && !container ? "compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleCardClick(e: React.MouseEvent) {
    // While a connector is being drawn, clicking a card completes the connection.
    // Stop propagation so the click doesn't bubble to the canvas background handler,
    // which would cancel connect mode and wipe the just-created pending connection.
    if (connectingFrom !== null) {
      e.stopPropagation();
      requestConnect(element.name);
      return;
    }
    if (groupingSource !== null) {
      if (element.name !== groupingSource) onGroupLink(element.name);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      selectToggle(element.name);
    } else if (e.shiftKey) {
      selectRange(element.name);
    } else if (selectedName === element.name && selectedNames.size <= 1) {
      clearSelection();
    } else {
      select(element.name);
    }
  }

  function handleGroupIconClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (multiSelect) {
      useBuilderStore.getState().groupSelected();
    } else {
      onGroupLink(element.name);
    }
  }

  // Drag the ⚡ logic handle to another question to wire up conditional logic. A plain
  // click (no drag) falls back to click-to-connect mode (handled by onClick).
  function handlePortPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    startConnect(element.name);
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        dragging = true;
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!dragging) return; // treat as a click → stay in connect mode
      const card = (
        document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      )?.closest<HTMLElement>("[data-el-name]");
      const name = card?.dataset.elName;
      if (name && name !== element.name) requestConnect(name);
      else cancelConnect();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <li
      ref={setRefs}
      style={style}
      className={cls}
      data-el-name={element.name}
      data-connecting={connectingFrom === element.name ? "" : undefined}
    >
      {/* The whole row is the drag activator — pressing anywhere on the card (not just the
          grip) reorders it. Interactive children (inputs, action buttons) stop pointer
          propagation so they still click/type without starting a drag. */}
      <div className="el-row" {...(groupingSource ? {} : { ...attributes, ...listeners })}>
        <span className="drag-handle" title="Drag to reorder" aria-hidden="true">
          ⋮⋮
        </span>

        <span className="el-number" aria-hidden="true">
          {index + 1}
        </span>

        {container && (
          <button
            type="button"
            className="el-collapse"
            title={collapsed ? "Expand section" : "Collapse section"}
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed(element.name);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        )}

        <button
          type="button"
          className="el-card-body"
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") select(element.name);
          }}
        >
          {inSelection && multiSelect && (
            <span className="el-check" aria-hidden="true">
              ✓
            </span>
          )}
          <input
            className={`el-label-input${editing ? " editing" : " display"}`}
            value={localize(element.label) || ""}
            placeholder={editing ? "Question text" : ""}
            readOnly={!editing}
            onChange={editing ? (e) => update(element.name, { label: e.target.value }) : undefined}
            // Only swallow the pointer while editing (so you can place the caret / select
            // text). When not editing, let it bubble so a press on the title starts a drag.
            onPointerDown={editing ? (e) => e.stopPropagation() : undefined}
            // The row also carries dnd-kit's keyboard-sensor listeners (Space/Arrow keys
            // drive keyboard drag reordering) — stop propagation while editing so typing a
            // space in the label doesn't get intercepted and preventDefault()-ed by dnd-kit.
            onKeyDown={editing ? (e) => e.stopPropagation() : undefined}
            onClick={(e) => e.stopPropagation()}
          />
          {element.required && editing ? <span className="el-required">*</span> : null}
          <span className="el-type">
            {element.type.replace(/_/g, " ")}
            {container && (
              <span className="el-count">
                {childCount} {childCount === 1 ? "question" : "questions"}
              </span>
            )}
            {(element.visibleIf || element.requiredIf || element.enableIf) && (
              <span className="el-logic-badge" title={logicSummary(element)}>
                ⚡ logic
              </span>
            )}
            {elNotes.length > 0 && (
              <span
                className={`el-note-badge${elNotes.some((n) => n.level === "error") ? " error" : " warning"}`}
                title={elNotes.map((n) => n.message).join("\n")}
              >
                {elNotes.some((n) => n.level === "error") ? "⛔" : "⚠️"} {elNotes.length}
              </span>
            )}
          </span>
        </button>

        {/* Action controls must not initiate a card drag. */}
        <div className="el-actions" onPointerDown={(e) => e.stopPropagation()}>
          {!container && (
            <button
              type="button"
              className="el-compact-toggle"
              title={compact ? "Expand this question" : "Collapse this question to one line"}
              aria-expanded={!compact}
              onClick={(e) => {
                e.stopPropagation();
                toggleCompact(element.name);
              }}
            >
              {compact ? "▸" : "▾"}
            </button>
          )}
          <button type="button" title="Duplicate" onClick={() => duplicate(element.name)}>
            ⧉
          </button>
          <button
            type="button"
            title="Delete"
            onClick={() => {
              if (!confirmDeleteContainer(element.type, childCount)) return;
              remove(element.name);
            }}
          >
            🗑
          </button>
          <div className="el-overflow-wrap" ref={overflowRef}>
            <button
              type="button"
              className="el-overflow-btn"
              title="More actions"
              onClick={(e) => {
                e.stopPropagation();
                setOverflowOpen((o) => !o);
              }}
            >
              ⋯
            </button>
            {overflowOpen && (
              <div className="el-overflow-menu">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => {
                    moveBy(element.name, -1);
                    setOverflowOpen(false);
                  }}
                >
                  ↑ Move up
                </button>
                <button
                  type="button"
                  disabled={index === count - 1}
                  onClick={() => {
                    moveBy(element.name, 1);
                    setOverflowOpen(false);
                  }}
                >
                  ↓ Move down
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const label = localize(element.label) || element.name;
                    try {
                      await api.createQuestionTemplate(
                        label,
                        element as unknown as Record<string, unknown>,
                      );
                      alert(`"${label}" saved to your question library.`);
                    } catch {
                      alert("Failed to save to library.");
                    }
                    setOverflowOpen(false);
                  }}
                >
                  ☆ Save to library
                </button>
                {container ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      ungroup(element.name);
                      setOverflowOpen(false);
                    }}
                  >
                    ⊟ Ungroup section
                  </button>
                ) : (
                  <button
                    type="button"
                    className={groupingSource === element.name ? "active" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGroupIconClick(e);
                      setOverflowOpen(false);
                    }}
                  >
                    ⊞ Group with another
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {(!container || collapsed) && !isDragging && !(compact && !container) && (
        <div
          className="el-preview"
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ")
              handleCardClick(e as unknown as React.MouseEvent);
          }}
          role="presentation"
        >
          <CardPreview element={element} editable={editing} />
        </div>
      )}

      {container && collapsed && (
        <button
          type="button"
          className="el-collapsed-note"
          onClick={() => toggleCollapsed(element.name)}
        >
          {childCount === 0
            ? "Empty section"
            : `${childCount} ${childCount === 1 ? "question" : "questions"} hidden`}{" "}
          — click to expand
        </button>
      )}

      {container && !collapsed && (
        <div className="el-children">
          <CanvasList
            elements={element.elements ?? []}
            selectedName={selectedName}
            selectedNames={selectedNames}
            pageIndex={location.pageIndex}
            parentName={element.name}
            activeDragId={activeDragId}
            overDragId={overDragId}
            groupingSource={groupingSource}
            onGroupLink={onGroupLink}
          />
        </div>
      )}

      {!container && (
        <button
          type="button"
          className={`el-port${connectingFrom === element.name ? " active" : ""}`}
          title={
            connectingFrom === element.name
              ? "Connecting… drop on a question, or click one — Esc to cancel"
              : "Drag to a question to add conditional logic (or click, then click the trigger)"
          }
          onPointerDown={handlePortPointerDown}
          onClick={(e) => e.stopPropagation()}
          aria-label="Add conditional logic"
        >
          ⚡
        </button>
      )}
    </li>
  );
}
