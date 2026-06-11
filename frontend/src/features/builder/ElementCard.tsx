import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DropLocation } from "./BuilderCanvas";
import { CanvasList } from "./CanvasList";
import { CardPreview } from "./CardPreview";
import { isContainerType } from "./model";

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
  const { select, selectToggle, selectRange, update, moveBy, duplicate, remove } =
    useBuilderStore();
  const container = isContainerType(element.type);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: element.name,
    data: { location },
    // Block sortable drag when in group-link mode so clicks work cleanly.
    disabled: groupingSource !== null,
  });

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
    <li ref={setNodeRef} style={style} className={cls}>
      <div className="el-row" {...(groupingSource ? {} : { ...attributes, ...listeners })}>
        <span className="drag-handle" aria-hidden="true">
          ⋮⋮
        </span>

        <div
          className="el-card-body"
          onClick={handleCardClick}
          role="button"
          tabIndex={0}
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
          <span className="el-type">{element.type.replace(/_/g, " ")}</span>
        </div>

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
          <button
            type="button"
            title={multiSelect ? "Group selected questions" : "Group with another question"}
            className={groupingSource === element.name ? "active" : ""}
            onClick={handleGroupIconClick}
          >
            ⊞
          </button>
          <button type="button" title="Delete" onClick={() => remove(element.name)}>
            🗑
          </button>
        </div>
      </div>

      {!container && !isDragging && (
        <div className="el-preview" onClick={handleCardClick}>
          <CardPreview element={element} editable={editing} />
        </div>
      )}

      {container && (
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
