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

  function getCardCoords(name: string): { rx: number; ry: number; lx: number; ly: number } | null {
    const card = containerEl.querySelector<HTMLElement>(`[data-el-name="${name}"]`);
    if (!card) return null;
    const r = card.getBoundingClientRect();
    const top = r.top - containerRect.top;
    const mid = top + r.height / 2;
    return {
      rx: r.right - containerRect.left,
      ry: mid,
      lx: r.left - containerRect.left,
      ly: mid,
    };
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
        const src = getCardCoords(conn.fromName);
        const tgt = getCardCoords(conn.toName);
        if (!src || !tgt) return null;

        const cx = Math.max(60, Math.abs(tgt.lx - src.rx) * 0.5);
        const d = `M ${src.rx} ${src.ry} C ${src.rx + cx} ${src.ry} ${tgt.lx - cx} ${tgt.ly} ${tgt.lx} ${tgt.ly}`;
        const midX = (src.rx + tgt.lx) / 2;
        const midY = (src.ry + tgt.ly) / 2;
        const isNe = conn.op === "!=";
        const color = isNe ? "#f59e0b" : "#6366f1";
        const marker = isNe ? "url(#arr-ne)" : "url(#arr-eq)";
        const label = `${isNe ? "≠" : "="} ${conn.display}`;

        const removeConn = () => update(conn.toName, { visibleIf: undefined });

        const pillW = 72;
        const pillH = 22;

        return (
          <g key={`${conn.fromName}->${conn.toName}`}>
            <path
              d={d}
              stroke={color}
              strokeWidth={2}
              fill="none"
              markerEnd={marker}
              opacity={0.7}
            />
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
