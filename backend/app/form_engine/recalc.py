"""Dependency-ordered recalculation of ``calculate`` fields.

Each calculated question is like a spreadsheet cell: its formula references other
questions by key. Historically calc fields were evaluated in document order, so a formula
that referenced a field defined *later* silently saw ``None``. This module builds a
dependency graph from the formulas and evaluates them in topological order, so order in
the form no longer matters, and it detects circular references (A → B → A) instead of
yielding a wrong value.

Scope rules mirror the validator:

* **Groups** are transparent — their calc fields share the enclosing answer scope, so we
  descend into them when collecting a scope's calculations.
* **Repeats** are isolated — each instance recalculates in its own scope, so we do *not*
  descend into them here (the caller recurses per-instance).
"""

from __future__ import annotations

import ast
from typing import Any

from app.form_engine.expressions import evaluate
from app.schemas.form_schema import Element


def referenced_names(expression: str) -> set[str]:
    """Field identifiers an expression reads, excluding function names and literals."""
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError:
        return set()
    func_names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            func_names.add(node.func.id)
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id not in ("True", "False", "None"):
            if node.id not in func_names:
                names.add(node.id)
    return names


def collect_calcs(elements: list[Element]) -> dict[str, str]:
    """Map calc field name -> expression for one scope (descends groups, skips repeats)."""
    out: dict[str, str] = {}

    def walk(els: list[Element]) -> None:
        for el in els:
            if el.calculate:
                out[el.name] = el.calculate
            elif el.type == "group" and el.elements:
                walk(el.elements)
            # repeats: isolated scope — not part of this scope's calc graph

    walk(elements)
    return out


def _topo_order(calcs: dict[str, str]) -> tuple[list[str], set[str]]:
    """Return (evaluation order, names involved in a cycle). Cyclic names are excluded."""
    deps = {name: referenced_names(expr) & set(calcs) for name, expr in calcs.items()}
    order: list[str] = []
    # 0 = unvisited, 1 = on stack (visiting), 2 = done
    state: dict[str, int] = {}
    cyclic: set[str] = set()

    def visit(name: str, stack: list[str]) -> None:
        st = state.get(name, 0)
        if st == 2:
            return
        if st == 1:
            # Back-edge: everything from `name` to the top of the stack is in a cycle.
            i = stack.index(name)
            cyclic.update(stack[i:])
            return
        state[name] = 1
        stack.append(name)
        for dep in deps[name]:
            visit(dep, stack)
        stack.pop()
        state[name] = 2
        if name not in cyclic:
            order.append(name)

    for name in calcs:
        visit(name, [])
    # Drop any name later marked cyclic that slipped into order via a different path.
    order = [n for n in order if n not in cyclic]
    return order, cyclic


def compute_scope(elements: list[Element], ctx: dict[str, Any]) -> set[str]:
    """Evaluate the scope's calc fields into ``ctx`` in dependency order.

    Returns the set of field names that could not be computed because they're part of a
    circular reference. Evaluation never raises — a formula that errors at runtime simply
    leaves its field unset (fail-safe, matching the rest of the submission path).
    """
    calcs = collect_calcs(elements)
    if not calcs:
        return set()
    order, cyclic = _topo_order(calcs)
    for name in order:
        try:
            ctx[name] = evaluate(calcs[name], ctx)
        except Exception:  # noqa: BLE001 - a bad calc must not 500 the request
            ctx.pop(name, None)
    return cyclic


def find_cycles(elements: list[Element]) -> set[str]:
    """Static check: names whose ``calculate`` formulas form a circular reference."""
    _, cyclic = _topo_order(collect_calcs(elements))
    return cyclic
