import { useBuilderStore } from "@/stores/builderStore";
import { useEffect, useState } from "react";
import { collectConnectors } from "./connectors";

export function ConnectorLayer({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const schema = useBuilderStore((s) => s.schema);
  const update = useBuilderStore((s) => s.update);
  const [, setTick] = useState(0);

  // Re-measure after schema changes (rAF so DOM has settled)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — schema change triggers re-measure
  useEffect(() => {
    const frame = requestAnimationFrame(() => setTick((n) => n + 1));
    return () => cancelAnimationFrame(frame);
  }, [schema]);

  const container = containerRef.current;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const containerEl = container;

  // Escape a value for use inside an attribute selector (option values are slugs, but be safe).
  const escAttr = (v: string) =>
    typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&");

  interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  interface Anchors {
    /** Start point — right edge of the source card, at the referenced option's row when found. */
    sx: number;
    sy: number;
    /** End point — right edge of the target card, vertically centered. */
    ex: number;
    ey: number;
    /** The matched source option's bounding box (container coords), if the value maps to a row. */
    optBox: Box | null;
    /** The target card's bounding box (container coords), for the inbound highlight. */
    toBox: Box;
  }

  function getAnchors(conn: { fromName: string; toName: string; value: unknown }): Anchors | null {
    const fromCard = containerEl.querySelector<HTMLElement>(`[data-el-name="${conn.fromName}"]`);
    const toCard = containerEl.querySelector<HTMLElement>(`[data-el-name="${conn.toName}"]`);
    if (!fromCard || !toCard) return null;
    const fr = fromCard.getBoundingClientRect();
    const tr = toCard.getBoundingClientRect();
    const rel = (r: DOMRect): Box => ({
      x: r.left - containerRect.left,
      y: r.top - containerRect.top,
      w: r.width,
      h: r.height,
    });

    // Anchor the start to the specific referenced option row when it exists in the DOM.
    let optBox: Box | null = null;
    if (typeof conn.value === "string") {
      const opt = fromCard.querySelector<HTMLElement>(`[data-opt-value="${escAttr(conn.value)}"]`);
      if (opt) optBox = rel(opt.getBoundingClientRect());
    }

    const sx = fr.right - containerRect.left;
    const sy = optBox ? optBox.y + optBox.h / 2 : fr.top - containerRect.top + fr.height / 2;
    const ex = tr.right - containerRect.left;
    const ey = tr.top - containerRect.top + tr.height / 2;
    return { sx, sy, ex, ey, optBox, toBox: rel(tr) };
  }

  const paths = collectConnectors(schema);

  if (paths.length === 0) return null;

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative connector lines, not meaningful content
    <svg className="connector-layer">
      <defs>
        <marker id="arr-eq" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0 0 L8 3 L0 6z" fill="#6366f1" />
        </marker>
        <marker id="arr-ne" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0 0 L8 3 L0 6z" fill="#f59e0b" />
        </marker>
      </defs>
      {paths.map((conn) => {
        const a = getAnchors(conn);
        if (!a) return null;

        // Route both ends out into the right-hand gutter so the curve never slashes across the
        // cards. The control points bow rightward past whichever card extends further right.
        const bow = 40 + Math.min(60, Math.abs(a.ey - a.sy) * 0.15);
        const ctrlX = Math.max(a.sx, a.ex) + bow;
        const d = `M ${a.sx} ${a.sy} C ${ctrlX} ${a.sy}, ${ctrlX} ${a.ey}, ${a.ex} ${a.ey}`;
        // Pill at the cubic's t=0.5 point — out in the gutter, clear of both cards.
        const midX = 0.125 * (a.sx + a.ex) + 0.75 * ctrlX;
        const midY = (a.sy + a.ey) / 2;
        const isNe = conn.op === "!=";
        const color = isNe ? "#f59e0b" : "#6366f1";
        const marker = isNe ? "url(#arr-ne)" : "url(#arr-eq)";
        const label = `${isNe ? "≠" : "="} ${conn.display}`;

        const removeConn = () => update(conn.toName, { visibleIf: undefined });

        const pillW = 72;
        const pillH = 22;

        return (
          <g key={`${conn.fromName}->${conn.toName}`}>
            {/* Highlight the specific source option the rule keys off (when it's a visible row). */}
            {a.optBox && (
              <rect
                x={a.optBox.x - 4}
                y={a.optBox.y - 2}
                width={a.optBox.w + 8}
                height={a.optBox.h + 4}
                rx={6}
                fill={color}
                fillOpacity={0.08}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.85}
              />
            )}
            {/* Subtle inbound highlight on the dependent (target) card. */}
            <rect
              x={a.toBox.x - 2}
              y={a.toBox.y - 2}
              width={a.toBox.w + 4}
              height={a.toBox.h + 4}
              rx={10}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="2 4"
              opacity={0.4}
            />
            <path
              d={d}
              stroke={color}
              strokeWidth={2}
              fill="none"
              markerEnd={marker}
              opacity={0.7}
            />
            {/* Anchor dot where the line leaves the source option/card. */}
            <circle cx={a.sx} cy={a.sy} r={3.5} fill={color} opacity={0.9} />
            {/* Wide invisible stroke for easier clicking */}
            <path
              d={d}
              stroke="transparent"
              strokeWidth={14}
              fill="none"
              role="button"
              aria-label={`Remove condition: ${label}`}
              tabIndex={0}
              style={{ cursor: "pointer", pointerEvents: "stroke" }}
              onClick={removeConn}
              onKeyDown={(e) => e.key === "Enter" && removeConn()}
            />
            {/* Condition pill with explicit × remove */}
            <g transform={`translate(${midX},${midY})`}>
              <title>Condition: {label} — click × to remove</title>
              {/* pill background */}
              <rect
                x={-pillW / 2}
                y={-pillH / 2}
                width={pillW}
                height={pillH}
                rx={pillH / 2}
                fill={color}
                opacity={0.92}
              />
              {/* condition label */}
              <text
                x={-8}
                y={4}
                textAnchor="middle"
                fill="white"
                fontSize={10}
                fontWeight={600}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {label}
              </text>
              {/* × remove button */}
              <g
                transform={`translate(${pillW / 2 - 11}, 0)`}
                // biome-ignore lint/a11y/useSemanticElements: SVG group cannot be a <button>
                role="button"
                aria-label={`Remove condition: ${label}`}
                tabIndex={0}
                style={{ cursor: "pointer", pointerEvents: "all" }}
                onClick={removeConn}
                onKeyDown={(e) => e.key === "Enter" && removeConn()}
              >
                <circle r={8} fill="rgba(0,0,0,0.25)" />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={10}
                  fontWeight={700}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  ×
                </text>
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
