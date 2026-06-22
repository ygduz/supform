import { localize } from "@/lib/i18n";
import { useBuilderStore } from "@/stores/builderStore";
import type { Element, Page } from "@/types/form-schema";

/* ── Layout constants ─────────────────────────────────────── */
const ROOT_W = 120;
const ROOT_H = 32;
const PAGE_W = 100;
const PAGE_H = 28;
const EL_W = 88;
const EL_H = 22;
const H_GAP = 20; // horizontal gap between page columns
const V_GAP = 10; // vertical gap between nodes in a column
const PAGE_TO_ROOT = 40; // vertical space from root to page row
const EL_TO_PAGE = 14; // vertical space from page node to first element

type Pt = { x: number; y: number };

interface PageNode {
  page: Page;
  idx: number;
  x: number; // center x
  y: number; // top y
  els: ElNode[];
}
interface ElNode {
  el: Element;
  x: number;
  y: number;
}

function buildLayout(
  pages: Page[],
  canvasW: number,
): { root: Pt; pageNodes: PageNode[]; totalH: number } {
  // Compute column widths (each column = max(PAGE_W, EL_W))
  const colW = EL_W + H_GAP;
  const totalW = pages.length * colW - H_GAP;
  const startX = Math.max(0, (canvasW - totalW) / 2) + EL_W / 2;

  const root: Pt = { x: canvasW / 2, y: 20 };
  const pageY = root.y + ROOT_H / 2 + PAGE_TO_ROOT;

  let maxBottom = 0;
  const pageNodes: PageNode[] = pages.map((page, idx) => {
    const cx = startX + idx * colW;
    const topLevelEls = page.elements.filter((el) => el.type !== "hidden");
    const els: ElNode[] = topLevelEls.map((el, ei) => ({
      el,
      x: cx,
      y: pageY + PAGE_H + EL_TO_PAGE + ei * (EL_H + V_GAP),
    }));
    const bottom = els.length > 0 ? els[els.length - 1].y + EL_H : pageY + PAGE_H;
    if (bottom > maxBottom) maxBottom = bottom;
    return { page, idx, x: cx, y: pageY, els };
  });

  return { root, pageNodes, totalH: maxBottom + 24 };
}

function typeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** SVG rounded-rect path helper */
function rrect(x: number, y: number, w: number, h: number, r = 6) {
  return `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - 2 * r} a${r},${r} 0 0 1 -${r},-${r} v-${h - 2 * r} a${r},${r} 0 0 1 ${r},-${r} z`;
}

export function MindMapPanel() {
  const { schema, selectedName, select } = useBuilderStore();
  const pages = schema.pages;
  const CANVAS_W = 360;
  const { root, pageNodes, totalH } = buildLayout(pages, CANVAS_W);

  return (
    <div className="mindmap-panel">
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: aria-label provides accessible name */}
      <svg
        viewBox={`0 0 ${CANVAS_W} ${totalH}`}
        width={CANVAS_W}
        height={totalH}
        aria-label="Form mind map"
        role="img"
      >
        {/* ── Root node ── */}
        <path
          d={rrect(root.x - ROOT_W / 2, root.y - ROOT_H / 2, ROOT_W, ROOT_H, 8)}
          fill="var(--primary)"
        />
        <text
          x={root.x}
          y={root.y + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--surface-raised)"
          style={{ fontFamily: "var(--font)" }}
        >
          {(localize(schema.title) || "Untitled").slice(0, 16)}
        </text>

        {pageNodes.map((pn) => {
          const pageCx = pn.x;
          const pageCy = pn.y + PAGE_H / 2;
          const isPageActive =
            schema.pages[useBuilderStore.getState().activePage]?.name === pn.page.name;

          return (
            <g key={pn.page.name}>
              {/* Root → Page connector */}
              <path
                d={`M${root.x},${root.y + ROOT_H / 2} C${root.x},${root.y + ROOT_H / 2 + 20} ${pageCx},${pn.y - 20} ${pageCx},${pn.y}`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth={1.5}
              />

              {/* nextPageIf branching arrows between pages */}
              {(pn.page.nextPageIf ?? []).map((rule, ri) => {
                const target = pageNodes.find((p) => p.page.name === rule.page);
                if (!target) return null;
                const x1 = pageCx + PAGE_W / 2;
                const y1 = pn.y + PAGE_H / 2;
                const x2 = target.x - PAGE_W / 2;
                const y2 = target.y + PAGE_H / 2;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: branching rules have no stable id
                  <g key={`branch-${ri}`}>
                    <path
                      d={`M${x1},${y1} C${x1 + 20},${y1} ${x2 - 20},${y2} ${x2},${y2}`}
                      fill="none"
                      stroke="var(--accent-teal)"
                      strokeWidth={1.2}
                      strokeDasharray="4 3"
                    />
                  </g>
                );
              })}

              {/* Page node */}
              <path
                d={rrect(pageCx - PAGE_W / 2, pn.y, PAGE_W, PAGE_H, 6)}
                fill={isPageActive ? "var(--primary-light)" : "var(--surface-raised)"}
                stroke={isPageActive ? "var(--primary)" : "var(--border-strong)"}
                strokeWidth={1.5}
              />
              <text
                x={pageCx}
                y={pageCy + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fontWeight={600}
                fill={isPageActive ? "var(--primary)" : "var(--text-secondary)"}
                style={{ fontFamily: "var(--font)" }}
              >
                {(localize(pn.page.title) || `Page ${pn.idx + 1}`).slice(0, 14)}
              </text>

              {/* Elements */}
              {pn.els.map((en, ei) => {
                const isSelected = selectedName === en.el.name;
                const hasCond = Boolean(en.el.visibleIf);
                // connector from page or previous el
                const fromY = ei === 0 ? pn.y + PAGE_H : en.y - V_GAP;
                const fromX = pageCx;

                return (
                  <g
                    key={en.el.name}
                    style={{ cursor: "pointer" }}
                    onClick={() => select(en.el.name)}
                    onKeyDown={(e) => e.key === "Enter" && select(en.el.name)}
                    // biome-ignore lint/a11y/useSemanticElements: SVG g cannot be button
                    role="button"
                    tabIndex={0}
                  >
                    {/* Vertical connector */}
                    <line
                      x1={fromX}
                      y1={fromY}
                      x2={en.x}
                      y2={en.y}
                      stroke={hasCond ? "var(--accent-mustard)" : "var(--border)"}
                      strokeWidth={1}
                      strokeDasharray={hasCond ? "3 3" : undefined}
                    />

                    {/* Element node */}
                    <path
                      d={rrect(en.x - EL_W / 2, en.y, EL_W, EL_H, 4)}
                      fill={isSelected ? "var(--primary)" : "var(--surface)"}
                      stroke={
                        isSelected
                          ? "var(--primary-hover)"
                          : hasCond
                            ? "var(--accent-mustard)"
                            : "var(--border)"
                      }
                      strokeWidth={isSelected ? 0 : 1}
                    />
                    <text
                      x={en.x}
                      y={en.y + EL_H / 2 + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={8.5}
                      fill={isSelected ? "var(--surface-raised)" : "var(--text)"}
                      style={{ fontFamily: "var(--font)" }}
                    >
                      {(localize(en.el.label) || en.el.name).slice(0, 12)}
                    </text>
                    <text
                      x={en.x}
                      y={en.y + EL_H / 2 + 1}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={7}
                      fill={isSelected ? "var(--primary-light)" : "var(--muted)"}
                      dx={EL_W / 2 - 4}
                      style={{ fontFamily: "var(--font)" }}
                    >
                      {typeLabel(en.el.type).slice(0, 6)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mindmap-legend">
        <span>
          <span className="mm-dot mm-dot--cond" /> conditional
        </span>
        <span>
          <span className="mm-dot mm-dot--branch" /> branching
        </span>
      </div>
    </div>
  );
}
