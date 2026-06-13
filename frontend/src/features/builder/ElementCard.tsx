import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef } from "react";
import type { DropLocation } from "./BuilderCanvas";
import { CanvasList } from "./CanvasList";
import { CardPreview } from "./CardPreview";
import { isContainerType } from "./model";

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
  const { select, selectToggle, selectRange, update, moveBy, duplicate, remove, ungroup } =
    useBuilderStore();
  const collapsed = useBuilderStore((s) => s.collapsedNames.has(element.name));
  const toggleCollapsed = useBuilderStore((s) => s.toggleCollapsed);
  const container = isContainerType(element.type);
  const childCount = element.elements?.length ?? 0;

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
  ]
    .filter(Boolean)
    .join(" ");

  function handleCardClick(e: React.MouseEvent) {
    if (groupingSource !== null) {
      if (element.name !== groupingSource) onGroupLink(element.name);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      selectToggle(element.name);
    } else if (e.shiftKey) {
      selectRange(element.name);
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

  return (
    <li ref={setRefs} style={style} className={cls} data-el-name={element.name}>
      <div className="el-row">
        {/* Explicit drag activator: pointer drags from interactive children (the card-body
            button, inputs) are ignored by dnd-kit, so the handle carries the listeners. */}
        <span
          className="drag-handle"
          title="Drag to reorder"
          aria-hidden="true"
          {...(groupingSource ? {} : { ...attributes, ...listeners })}
        >
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
          {editing ? (
            <input
              className="el-label-input"
              value={localize(element.label)}
              placeholder="Question text"
              onChange={(e) => update(element.name, { label: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="el-label">
              {localize(element.label) || element.name}
              {element.required ? <span className="el-required">*</span> : null}
            </span>
          )}
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
          </span>
        </button>

        <div className="el-actions">
          <button
            type="button"
            title="Move up"
            disabled={index === 0}
            onClick={() => moveBy(element.name, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            title="Move down"
            disabled={index === count - 1}
            onClick={() => moveBy(element.name, 1)}
          >
            ↓
          </button>
          <button type="button" title="Duplicate" onClick={() => duplicate(element.name)}>
            ⧉
          </button>
          {container ? (
            <button
              type="button"
              title="Ungroup — lift questions out of this section"
              onClick={(e) => {
                e.stopPropagation();
                ungroup(element.name);
              }}
            >
              ⊟
            </button>
          ) : (
            <button
              type="button"
              title={multiSelect ? "Group selected questions" : "Group with another question"}
              className={groupingSource === element.name ? "active" : ""}
              onClick={handleGroupIconClick}
            >
              ⊞
            </button>
          )}
          <button
            type="button"
            title="Delete"
            onClick={() => {
              // Deleting a section takes its questions with it — confirm first.
              if (container && childCount > 0) {
                const ok = window.confirm(
                  `Delete this section and the ${childCount} ${
                    childCount === 1 ? "question" : "questions"
                  } inside it?\n\nTip: use Ungroup (⊟) to keep the questions.`,
                );
                if (!ok) return;
              }
              remove(element.name);
            }}
          >
            🗑
          </button>
        </div>
      </div>

      {!container && !isDragging && (
        <div
          className="el-preview"
          {...(groupingSource ? {} : listeners)}
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
    </li>
  );
}
