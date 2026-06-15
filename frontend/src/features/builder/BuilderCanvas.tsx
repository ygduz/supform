import { useBuilderStore } from "@/stores/builderStore";
import type { Element } from "@/types/form-schema";
import { useEffect, useRef } from "react";
import { BulkActionBar } from "./BulkActionBar";
import { CanvasList } from "./CanvasList";
import { ConditionPicker } from "./ConditionPicker";
import { ConnectorLayer } from "./ConnectorLayer";

/** Where a droppable lives in the tree; shared by CanvasList/ElementCard and BuilderPage. */
export interface DropLocation {
  pageIndex: number;
  parentName?: string;
  index: number;
}

/**
 * Canvas rendering layer — no DndContext here (lives in BuilderPage so the palette and
 * canvas share one context). Renders the sortable lists, the bulk-action bar, and the
 * group-link mode hint banner.
 */
export function BuilderCanvas({
  elements,
  pageIndex,
  activeDragId,
  overDragId,
  groupingSource,
  onGroupLink,
}: {
  elements: Element[];
  pageIndex: number;
  activeDragId: string | null;
  overDragId: string | null;
  groupingSource: string | null;
  onGroupLink: (targetName: string) => void;
}) {
  const { selectedName, selectedNames } = useBuilderStore();
  const setViewportName = useBuilderStore((s) => s.setViewportName);
  const connectingFrom = useBuilderStore((s) => s.connectingFrom);
  const cancelConnect = useBuilderStore((s) => s.cancelConnect);
  const multiCount = selectedNames.size;
  // Changes whenever cards are added/removed/reordered, so the observer re-binds.
  const cardKey = `${pageIndex}:${elements.map((e) => e.name).join(",")}`;

  // Scroll-spy: report the top-most card visible in the canvas viewport so the Map
  // panel can highlight "you are here". Re-observes whenever the element list changes.
  const innerRef = useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: cardKey is the re-bind trigger
  useEffect(() => {
    const root = innerRef.current?.closest(".canvas");
    if (!root) return;
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const name = (entry.target as HTMLElement).dataset.elName;
          if (name) ratios.set(name, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        // The visible card closest to the top of the scroll area wins.
        let best: string | null = null;
        let bestTop = Number.POSITIVE_INFINITY;
        const rootTop = root.getBoundingClientRect().top;
        for (const [name, ratio] of ratios) {
          if (ratio <= 0) continue;
          const el = root.querySelector<HTMLElement>(`[data-el-name="${name}"]`);
          if (!el) continue;
          const top = el.getBoundingClientRect().top - rootTop;
          if (top < bestTop) {
            bestTop = top;
            best = name;
          }
        }
        setViewportName(best);
      },
      { root, threshold: [0, 0.25, 0.5, 1] },
    );
    const cards = innerRef.current?.querySelectorAll<HTMLElement>("[data-el-name]");
    for (const c of cards ?? []) observer.observe(c);
    return () => observer.disconnect();
    // Re-observe when the set of rendered cards changes (add/remove/reorder/page switch).
  }, [setViewportName, cardKey]);

  // Cancel connecting mode on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && connectingFrom !== null) cancelConnect();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [connectingFrom, cancelConnect]);

  const canvasInnerCls = `canvas-inner${connectingFrom ? " connecting" : ""}`;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: background cancel is supplementary to Escape key handler
    <div
      className={canvasInnerCls}
      ref={innerRef}
      onClick={connectingFrom ? () => cancelConnect() : undefined}
    >
      {groupingSource && (
        <div className="group-link-hint">
          Click another question to group it with this one — or press <kbd>Esc</kbd> to cancel.
        </div>
      )}

      {connectingFrom && (
        <div className="connect-hint">
          Click the question to show or hide based on this answer — or press <kbd>Esc</kbd> to
          cancel.
        </div>
      )}

      <ConnectorLayer containerRef={innerRef} />

      <CanvasList
        elements={elements}
        selectedName={selectedName}
        selectedNames={selectedNames}
        pageIndex={pageIndex}
        activeDragId={activeDragId}
        overDragId={overDragId}
        groupingSource={groupingSource}
        onGroupLink={onGroupLink}
      />

      {multiCount >= 2 && <BulkActionBar count={multiCount} />}

      <ConditionPicker />
    </div>
  );
}
