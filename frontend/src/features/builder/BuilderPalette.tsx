import { Button } from "@/components";
import { Chevron } from "./Chevron";
import { PaletteItem } from "./PaletteItem";
import { QuestionLibraryPanel } from "./QuestionLibraryPanel";
import { ADVANCED_PALETTE, COMMON_PALETTE } from "./palette";

interface Props {
  open: boolean;
  setOpen: (fn: (o: boolean) => boolean) => void;
  showLibrary: boolean;
  setShowLibrary: (v: boolean) => void;
}

/**
 * Left sidebar: the question-type palette (Fields tab, with common types up front and the
 * rest behind a "More types" disclosure) and the saved-question Library tab, plus the
 * collapse/expand toggle. Drag is driven by the parent DndContext via PaletteItem.
 */
export function BuilderPalette({ open, setOpen, showLibrary, setShowLibrary }: Props) {
  return (
    <aside className="palette">
      {open && (
        <div className="palette-content">
          <div className="palette-tabs">
            <Button
              variant="ghost"
              size="sm"
              className={!showLibrary ? "palette-tab active" : "palette-tab"}
              onClick={() => setShowLibrary(false)}
            >
              Fields
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={showLibrary ? "palette-tab active" : "palette-tab"}
              onClick={() => setShowLibrary(true)}
            >
              Library
            </Button>
          </div>
          {showLibrary ? (
            <QuestionLibraryPanel onClose={() => setShowLibrary(false)} />
          ) : (
            <>
              <p className="palette-heading">Add a question</p>
              {COMMON_PALETTE.map((item) => (
                <PaletteItem key={item.type} type={item.type} label={item.label} icon={item.icon} />
              ))}
              <details className="palette-more">
                <summary>More types</summary>
                {ADVANCED_PALETTE.map((item) => (
                  <PaletteItem
                    key={item.type}
                    type={item.type}
                    label={item.label}
                    icon={item.icon}
                  />
                ))}
              </details>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        className="panel-toggle"
        title={open ? "Collapse fields panel" : "Expand fields panel"}
        aria-label={open ? "Collapse fields panel" : "Expand fields panel"}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="panel-toggle-chip" aria-hidden="true">
          <Chevron dir={open ? "left" : "right"} />
        </span>
      </button>
    </aside>
  );
}
