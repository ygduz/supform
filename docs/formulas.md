# Formulas

Supform expressions power conditional logic (`visibleIf`, `requiredIf`, `enableIf`),
calculated fields (`calculate`), and custom validation. Each question behaves like a
spreadsheet cell: you reference other questions **by their field key** and combine them
with operators and Excel-style functions.

```
total          = qty * unit_price
band           = IF(total >= 100, "free shipping", "standard")
full_name      = CONCAT(first_name, " ", last_name)
is_adult       = age >= 18
```

## References

Use a question's **key** (the `name`, shown under each question in the builder) as the
variable. A blank/unanswered field reads as empty: it counts as `0` in numeric context and
`""` in text context inside functions — exactly like an empty Excel cell.

```
discount = price * COUNTIF(coupons, "VALID") * 0.1
```

## Operators

| Kind | Operators |
|---|---|
| Arithmetic | `+`  `-`  `*`  `/`  `%`  `**` |
| Comparison | `==`  `!=`  `<`  `<=`  `>`  `>=` |
| Membership | `in`, `not in` |
| Logical | `and`, `or`, `not` (or the `AND()` / `OR()` / `NOT()` functions) |

## Functions

Function names are **case-insensitive** (`SUM`, `Sum`, and `sum` are the same). Note that
`IF`, `AND`, `OR`, and `NOT` must be written in their function form with uppercase letters
(`IF(...)`) — the lowercase words are language keywords.

### Logical
`IF(condition, then, [else])` · `IFS(cond1, val1, cond2, val2, …)` ·
`AND(…)` · `OR(…)` · `NOT(x)` · `SWITCH(expr, case1, val1, …, [default])` ·
`IFERROR(value, fallback)`

`IF` evaluates only the branch it takes, and `IFERROR` catches errors (including division
by zero), so they're safe to use defensively:

```
rate = IFERROR(distance / time, 0)
```

### Aggregate
`SUM(…)` · `AVERAGE(…)` · `MIN(…)` · `MAX(…)` · `COUNT(…)` (numbers only) ·
`COUNTA(…)` (non-blank) · `COUNTIF(range, criterion)` · `SUMIF(range, criterion, [sum_range])`

Criteria accept comparisons as strings: `COUNTIF(scores, ">=50")`.

### Math
`ROUND(x, [digits])` · `ROUNDUP` · `ROUNDDOWN` · `FLOOR(x, [significance])` ·
`CEILING(x, [significance])` · `MOD(a, b)` · `ABS(x)` · `POWER(base, exp)` ·
`SQRT(x)` · `INT(x)`

`ROUND` rounds half away from zero (`ROUND(2.5, 0) = 3`), matching Excel.

### Text
`CONCAT(…)` / `CONCATENATE(…)` · `LEFT(s, [n])` · `RIGHT(s, [n])` · `MID(s, start, len)` ·
`LEN(s)` · `UPPER(s)` · `LOWER(s)` · `TRIM(s)` · `SUBSTITUTE(s, old, new, [instance])` ·
`VALUE(s)`

### Info
`ISBLANK(x)` · `ISNUMBER(x)` · `ISTEXT(x)`

### Date
`TODAY()` · `DATEDIF(start, end, ["Y"|"M"|"D"])` · `YEAR(d)` · `MONTH(d)` · `DAY(d)`

Dates are ISO strings (`"2026-06-28"`).

## Calculated fields & evaluation order

Calculated questions recompute in **dependency order**, so a formula may reference a field
defined *later* in the form — Supform builds a dependency graph and evaluates each cell
after the cells it depends on:

```
subtotal  (number)
total     = subtotal + tax     # defined before `tax`, still resolves correctly
tax       = subtotal * 0.1
```

Circular references (A → B → A) are detected: the form editor flags them, and at submit
time the affected fields are simply left unset (a bad formula never breaks a submission).

## Where evaluation happens

The builder and renderer evaluate formulas **client-side for live preview**, but the
server **re-evaluates every submission authoritatively** — calculated values and logic can
never be spoofed by the client. The two evaluators share one function catalog
(`backend/app/form_engine/functions.py` ↔ `frontend/src/features/renderer/functions.ts`)
with a parity test suite so they can't drift.
