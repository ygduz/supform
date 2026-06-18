import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element, ElementType } from "@/types/form-schema";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { collectConnectors } from "./connectors";
import { fieldAbbr, fieldColor } from "./fieldMeta";
import { confirmDeleteContainer, findElement, isContainerType } from "./model";

// ── chip for a single element ─────────────────────────────────────

function TypeChip({ type }: { type: ElementType }) {
  return (
    <span
      className="ov-chip"
      style={{ background: `${fieldColor(type)}18`, color: fieldColor(type) }}
    >
      {fieldAbbr(type)}
    </span>
  );
}

// ── nested child rows (read-only, just visual) ────────────────────

function ChildRows({ elements }: { elements: Element[] }) {
  if (elements.length === 0) {
    return <div className="ov-child-empty">Empty section</div>;
  }
  return (
    <div className="ov-children">
      {elements.map((child) => (
        <div key={child.name} className="ov-child-row">
          <TypeChip type={child.type} />
          <span className="ov-child-label">{localize(child.label) || child.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── one sortable row ──────────────────────────────────────────────

function OverviewRow({
  element,
  index,
  isSelected,
  inViewport,
  expanded,
  onToggleExpand,
}: {
  element: Element;
  index: number;
  isSelected: boolean;
  inViewport: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const store = useBuilderStore();
  const container = isContainerType(element.type);
  const childCount = element.elements?.length ?? 0;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: element.name,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const cls = [
    "ov-row",
    isSelected ? "ov-selected" : "",
    inViewport ? "ov-in-viewport" : "",
    container ? "ov-container" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li ref={setNodeRef} style={style} className={cls}>
      <div className="ov-row-head">
        {/* drag handle */}
        <span className="ov-handle" {...attributes} {...listeners} aria-hidden="true">
          ⋮⋮
        </span>

        {/* index number */}
        <span className="ov-index">{index + 1}</span>

        {/* type chip */}
        <TypeChip type={element.type} />

        {/* label — click to focus on canvas */}
        <button type="button" className="ov-label" onClick={() => store.select(element.name)}>
          {localize(element.label) || element.name}
        </button>

        {/* container meta: child count + expand/collapse */}
        {container && (
          <button
            type="button"
            className="ov-expand"
            onClick={onToggleExpand}
            title={expanded ? "Collapse" : "Expand"}
          >
            <span className="ov-count">{childCount}</span>
            <span className="ov-chevron">{expanded ? "▾" : "▸"}</span>
          </button>
        )}

        <div className="ov-row-actions">
          <button
            type="button"
            className="ov-action-btn"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              if (!confirmDeleteContainer(element.type, childCount)) return;
              store.remove(element.name);
            }}
          >
            🗑
          </button>
        </div>
      </div>

      {container && expanded && <ChildRows elements={element.elements ?? []} />}
    </li>
  );
}

// ── ghost row rendered inside DragOverlay ─────────────────────────

function GhostRow({ element }: { element: Element }) {
  const container = isContainerType(element.type);
  const childCount = element.elements?.length ?? 0;
  return (
    <div className="ov-row ov-ghost">
      <div className="ov-row-head">
        <span className="ov-handle" aria-hidden="true">
          ⋮⋮
        </span>
        <TypeChip type={element.type} />
        <span className="ov-label-ghost">{localize(element.label) || element.name}</span>
        {container && <span className="ov-count ov-count-ghost">{childCount}</span>}
      </div>
    </div>
  );
}

// ── logic overview: every connector in the form at a glance ───────

function LogicOverview() {
  const { schema, update, select } = useBuilderStore();
  const connectors = collectConnectors(schema);
  if (connectors.length === 0) return null;

  const labelOf = (name: string): string => {
    const el = findElement(schema, name);
    return el ? localize(el.label) || el.name : name;
  };

  return (
    <div className="ov-logic">
      <div className="ov-logic-head">
        Logic <span className="ov-logic-count">{connectors.length}</span>
      </div>
      <ul className="ov-logic-list">
        {connectors.map((conn) => (
          <li key={`${conn.fromName}->${conn.toName}`} className="ov-logic-row">
            <button
              type="button"
              className="ov-logic-link"
              onClick={() => select(conn.toName)}
              title="Select the dependent question"
            >
              <span className="ov-logic-target">{labelOf(conn.toName)}</span>
              <span className="ov-logic-rule">
                when <strong>{labelOf(conn.fromName)}</strong> {conn.op === "!=" ? "≠" : "="}{" "}
                {conn.display}
              </span>
            </button>
            <button
              type="button"
              className="ov-logic-remove"
              title="Remove this rule"
              onClick={() => update(conn.toName, { visibleIf: undefined })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── main panel ────────────────────────────────────────────────────

export function OverviewPanel() {
  const { schema, activePage, selectedName, viewportName } = useBuilderStore();
  const store = useBuilderStore();
  const elements = schema.pages[activePage]?.elements ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function toggleExpand(name: string) {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: {
    active: { id: string | number };
    over: { id: string | number } | null;
  }) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const names = elements.map((el) => el.name);
    const from = names.indexOf(String(active.id));
    const to = names.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    // Single moveTo is enough: move active to target index in one shot.
    store.moveTo(String(active.id), to);
  }

  const activeElement = activeId ? elements.find((el) => el.name === activeId) : null;

  if (elements.length === 0) {
    return (
      <div className="ov-empty">
        <p>No questions yet.</p>
        <p className="ov-empty-hint">Add a question from the left palette.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="ov-panel">
        <div className="ov-header">
          <span className="ov-total">
            {elements.length} question{elements.length !== 1 ? "s" : ""}
          </span>
          {schema.pages.length > 1 && <span className="ov-page-tag">Page {activePage + 1}</span>}
        </div>

        <SortableContext
          items={elements.map((el) => el.name)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="ov-list">
            {elements.map((el, i) => (
              <OverviewRow
                key={el.name}
                element={el}
                index={i}
                isSelected={selectedName === el.name}
                inViewport={viewportName === el.name}
                expanded={expandedNames.has(el.name)}
                onToggleExpand={() => toggleExpand(el.name)}
              />
            ))}
          </ul>
        </SortableContext>

        <LogicOverview />
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeElement ? <GhostRow element={activeElement} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
