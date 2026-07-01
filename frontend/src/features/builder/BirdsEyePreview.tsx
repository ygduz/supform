import type { FormSchema } from "@/types/form-schema";
import { useEffect, useRef, useState } from "react";
import { FormRenderer } from "../renderer/FormRenderer";

/** Minimum CSS scale — below this text is illegible, so we stop zooming out and scroll. */
const MIN_SCALE = 0.22;
/** The width at which FormRenderer is designed to render. A wider natural width makes the
 *  scaled preview smaller, giving more of an overall, zoomed-out picture of the form. */
const FORM_NATURAL_WIDTH = 1080;
/** Manual zoom multiplier bounds and persistence. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.15;
const ZOOM_STORE = "supform:previewZoom";

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * Birds-eye live preview of the form.
 *
 * Scales the FormRenderer to fit the panel width. As more questions are added
 * the form grows taller; we scale horizontally and let the height follow. When
 * the computed scale would drop below MIN_SCALE the view stops shrinking and
 * the outer container scrolls instead.
 */
export function BirdsEyePreview({
  schema,
  onOpenFull,
  device = "desktop",
}: {
  schema: FormSchema;
  onOpenFull?: () => void;
  /** Top-bar device preview toggle — narrows the simulated form width to approximate a phone. */
  device?: "desktop" | "mobile";
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(300);
  const [innerH, setInnerH] = useState(800);
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(ZOOM_STORE));
    return saved >= ZOOM_MIN && saved <= ZOOM_MAX ? saved : 1;
  });

  const setZoomPersist = (next: number) => {
    const z = clampZoom(next);
    setZoom(z);
    try {
      localStorage.setItem(ZOOM_STORE, String(z));
    } catch {
      /* storage may be unavailable — non-fatal */
    }
  };

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver((entries) => {
      setPanelWidth(entries[0].contentRect.width);
    });
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver((entries) => {
      setInnerH(entries[0].contentRect.height);
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const naturalWidth = device === "mobile" ? 420 : FORM_NATURAL_WIDTH;
  // Fit-to-width scale, then the manual zoom multiplier; never below the legibility floor.
  const scale = Math.max(MIN_SCALE, (panelWidth / naturalWidth) * zoom);
  const scaledH = innerH * scale;

  return (
    <div className="bep-wrap">
      <div className="bep-header">
        <span>Live preview</span>
        <div className="bep-header-right">
          {/* biome-ignore lint/a11y/useSemanticElements: a button group, not a form fieldset */}
          <div className="bep-zoom" role="group" aria-label="Preview zoom">
            <button
              type="button"
              title="Zoom out"
              aria-label="Zoom out"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => setZoomPersist(zoom - ZOOM_STEP)}
            >
              −
            </button>
            <button
              type="button"
              title="Reset zoom (fit)"
              aria-label="Reset zoom"
              onClick={() => setZoomPersist(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              title="Zoom in"
              aria-label="Zoom in"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => setZoomPersist(zoom + ZOOM_STEP)}
            >
              +
            </button>
          </div>
          {onOpenFull && (
            <button type="button" className="bep-openfull" onClick={onOpenFull}>
              Open full ↗
            </button>
          )}
        </div>
      </div>
      <div className="bep-outer" ref={outerRef}>
        {/* Sized wrapper so the outer div knows how tall the scaled content is */}
        <div className="bep-clip" style={{ height: scaledH, width: panelWidth }}>
          <div
            ref={innerRef}
            className="bep-inner"
            style={{
              width: naturalWidth,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <FormRenderer schema={schema} formId="preview" />
          </div>
        </div>
      </div>
    </div>
  );
}
