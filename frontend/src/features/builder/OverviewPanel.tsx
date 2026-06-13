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
import { isContainerType } from "./model";

// ── type metadata ────────────────────────────────────────────────

const TYPE_COLOR: Partial<Record<ElementType, string>> = {
  text: "#3b82f6",
  longtext: "#3b82f6",
  email: "#3b82f6",
  url: "#3b82f6",
  phone: "#3b82f6",
  single_choice: "#10b981",
  multi_choice: "#10b981",
  dropdown: "#10b981",
  ranking: "#10b981",
  number: "#f59e0b",
  integer: "#f59e0b",
  decimal: "#f59e0b",
  date: "#8b5cf6",
  boolean: "#06b6d4",
  rating: "#eab308",
  scale: "#eab308",
  matrix: "#6366f1",
  file: "#6b7280",
  image: "#6b7280",
  signature: "#6b7280",
  geopoint: "#ef4444",
  note: "#94a3b8",
  html: "#94a3b8",
  group: "#059669",
  repeat: "#7c3aed",
  calculated: "#d97706",
};

const TYPE_ABBR: Partial<Record<ElementType, string>> = {
  text: "Aa",
  longtext: "§",
  email: "@",
  url: "//",
  phone: "☎",
  single_choice: "◉",
  multi_choice: "☑",
  dropdown: "▾",
  ranking: "↕",
  number: "1",
  integer: "#",
  decimal: "0.",
  date: "d",
  boolean: "Y/N",
  rating: "★",
  scale: "—",
  matrix: "⊞",
  file: "f",
  image: "img",
  signature: "sig",
  geopoint: "⌖",
  note: "i",
  html: "<>",
  group: "§",
  repeat: "↻",
  calculated: "ƒ",
};

function typeColor(type: ElementType) {
  return TYPE_COLOR[type] ?? "#94a3b8";
}
function typeAbbr(type: ElementType) {
  return TYPE_ABBR[type] ?? "?";
}

// ── chip for a single element ─────────────────────────────────────

function TypeChip({ type }: { type: ElementType }) {
  return (
    <span
      className="ov-chip"
      style={{ background: `${typeColor(type)}18`, color: typeColor(type) }}
    >
      {typeAbbr(type)}
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
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeElement ? <GhostRow element={activeElement} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
