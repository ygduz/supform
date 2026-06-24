import type { FormSchema } from "@/types/form-schema";
import { useEffect, useRef, useState } from "react";
import { FormRenderer } from "../renderer/FormRenderer";

/** Minimum CSS scale — below this text is illegible, so we stop zooming out and scroll. */
const MIN_SCALE = 0.4;
/** The width at which FormRenderer is designed to render. */
const FORM_NATURAL_WIDTH = 640;

/**
 * Birds-eye live preview of the form.
 *
 * Scales the FormRenderer to fit the panel width. As more questions are added
 * the form grows taller; we scale horizontally and let the height follow. When
 * the computed scale would drop below MIN_SCALE the view stops shrinking and
 * the outer container scrolls instead.
 */
export function BirdsEyePreview({ schema }: { schema: FormSchema }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(300);
  const [innerH, setInnerH] = useState(800);

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

  const scale = Math.max(MIN_SCALE, panelWidth / FORM_NATURAL_WIDTH);
  const scaledH = innerH * scale;

  return (
    <div className="bep-wrap">
      <div className="bep-header">
        <span>Live preview</span>
        <span className="bep-hint">scaled · read-only</span>
      </div>
      <div className="bep-outer" ref={outerRef}>
        {/* Sized wrapper so the outer div knows how tall the scaled content is */}
        <div className="bep-clip" style={{ height: scaledH, width: panelWidth }}>
          <div
            ref={innerRef}
            className="bep-inner"
            style={{
              width: FORM_NATURAL_WIDTH,
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
