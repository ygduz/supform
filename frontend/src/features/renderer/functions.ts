/**
 * Excel-style function catalog — the client mirror of the backend's
 * `app/form_engine/functions.py`. Both halves are kept bit-identical (same names, same
 * blank/number/text coercion, same rounding) and verified by a shared parity table in
 * `functions.test.ts` <-> `test_functions.py`. This runs only for live preview; the server
 * re-evaluates every submission authoritatively, so this is never trusted.
 *
 * Lazy short-circuiting (IF only running the taken branch, IFERROR catching errors) can't
 * be expressed when the host evaluates call arguments eagerly, so IF/IFERROR/etc. are
 * eager here. That still matches the backend for every realistic form formula because JS
 * arithmetic doesn't throw (e.g. `1/0` is `Infinity`, which IFERROR detects), and all
 * field identifiers are pre-seeded so references never throw.
 */

type Val = unknown;

const num = (v: Val): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).trim());
  if (Number.isNaN(n)) throw new Error(`Not a number: ${String(v)}`);
  return n;
};

const text = (v: Val): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  return String(v);
};

const truthy = (v: Val): boolean => {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "number") return v !== 0;
  return Boolean(v);
};

const flatten = (args: Val[]): Val[] => {
  const out: Val[] = [];
  for (const a of args) {
    if (Array.isArray(a)) out.push(...a);
    else out.push(a);
  }
  return out;
};

const numbers = (args: Val[]): number[] => {
  const out: number[] = [];
  for (const a of flatten(args)) {
    if (a === null || a === undefined || a === "") continue;
    if (typeof a === "boolean") {
      out.push(a ? 1 : 0);
      continue;
    }
    if (typeof a === "number") {
      out.push(a);
      continue;
    }
    const n = Number(String(a).trim());
    if (!Number.isNaN(n)) out.push(n);
  }
  return out;
};

const roundHalfUp = (x: number, digits: number): number => {
  const factor = 10 ** digits;
  const scaled = x * factor;
  const rounded = Math.floor(Math.abs(scaled) + 0.5) * (scaled >= 0 ? 1 : -1);
  return rounded / factor;
};

const matches = (value: Val, criterion: Val): boolean => {
  if (typeof criterion === "string") {
    const ops: Array<
      [string, (a: number, b: number) => boolean, (a: string, b: string) => boolean]
    > = [
      [">=", (a, b) => a >= b, (a, b) => a >= b],
      ["<=", (a, b) => a <= b, (a, b) => a <= b],
      ["<>", (a, b) => a !== b, (a, b) => a !== b],
      [">", (a, b) => a > b, (a, b) => a > b],
      ["<", (a, b) => a < b, (a, b) => a < b],
      ["=", (a, b) => a === b, (a, b) => a === b],
    ];
    for (const [prefix, cmpNum, cmpStr] of ops) {
      if (criterion.startsWith(prefix)) {
        const rest = criterion.slice(prefix.length).trim();
        const a = Number(text(value));
        const b = Number(rest);
        if (!Number.isNaN(a) && !Number.isNaN(b)) return cmpNum(a, b);
        return cmpStr(text(value), rest);
      }
    }
  }
  return value === criterion || text(value) === text(criterion);
};

const datePart = (v: Val, part: "year" | "month" | "day"): number => {
  const [y, m, d] = text(v).slice(0, 10).split("-").map(Number);
  return { year: y, month: m, day: d }[part];
};

const parseDateUTC = (v: Val): number => {
  const [y, m, d] = text(v).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** The catalog, keyed by lowercase name (lookup is case-insensitive at the call site). */
export const EXCEL_FUNCTIONS: Record<string, (...args: Val[]) => Val> = {
  // logical (eager here; see file header)
  if: (...a) => (truthy(a[0]) ? a[1] : a.length === 3 ? a[2] : false),
  ifs: (...a) => {
    for (let i = 0; i + 1 < a.length; i += 2) if (truthy(a[i])) return a[i + 1];
    throw new Error("IFS: no condition matched");
  },
  and: (...a) => a.every(truthy),
  or: (...a) => a.some(truthy),
  not: (...a) => !truthy(a[0]),
  switch: (...a) => {
    const subject = a[0];
    const rest = a.slice(1);
    let i = 0;
    for (; i + 1 < rest.length; i += 2) if (rest[i] === subject) return rest[i + 1];
    if (i < rest.length) return rest[i];
    throw new Error("SWITCH: no case matched");
  },
  iferror: (...a) => {
    const v = a[0];
    const bad = v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
    return bad ? a[1] : v;
  },
  // aggregate
  sum: (...a) => numbers(a).reduce((x, y) => x + y, 0),
  average: (...a) => {
    const n = numbers(a);
    if (!n.length) throw new Error("AVERAGE of no numbers");
    return n.reduce((x, y) => x + y, 0) / n.length;
  },
  min: (...a) => {
    const n = numbers(a);
    return n.length ? Math.min(...n) : 0;
  },
  max: (...a) => {
    const n = numbers(a);
    return n.length ? Math.max(...n) : 0;
  },
  count: (...a) => numbers(a).length,
  counta: (...a) => flatten(a).filter((x) => x !== null && x !== undefined && x !== "").length,
  countif: (range, criterion) => {
    const items = Array.isArray(range) ? range : [range];
    return items.filter((x) => matches(x, criterion)).length;
  },
  sumif: (range, criterion, sumRange) => {
    const items = Array.isArray(range) ? range : [range];
    const targets = Array.isArray(sumRange)
      ? sumRange
      : sumRange === undefined
        ? items
        : [sumRange];
    let total = 0;
    items.forEach((x, i) => {
      if (matches(x, criterion) && i < targets.length) {
        const n = Number(text(targets[i]));
        if (!Number.isNaN(n)) total += n;
      }
    });
    return total;
  },
  // math
  round: (x, d = 0) => roundHalfUp(num(x), Math.trunc(num(d))),
  roundup: (x, d = 0) => {
    const f = 10 ** Math.trunc(num(d));
    const v = num(x) * f;
    return (v >= 0 ? Math.ceil(v) : Math.floor(v)) / f;
  },
  rounddown: (x, d = 0) => {
    const f = 10 ** Math.trunc(num(d));
    const v = num(x) * f;
    return (v >= 0 ? Math.floor(v) : Math.ceil(v)) / f;
  },
  floor: (x, sig = 1) => (num(sig) === 0 ? 0 : Math.floor(num(x) / num(sig)) * num(sig)),
  ceiling: (x, sig = 1) => (num(sig) === 0 ? 0 : Math.ceil(num(x) / num(sig)) * num(sig)),
  // Excel/Python MOD takes the sign of the divisor; JS `%` doesn't, so normalize.
  mod: (a, b) => {
    const A = num(a);
    const B = num(b);
    return B === 0 ? Number.NaN : ((A % B) + B) % B;
  },
  abs: (x) => Math.abs(num(x)),
  power: (b, e) => num(b) ** num(e),
  sqrt: (x) => Math.sqrt(num(x)),
  int: (x) => Math.floor(num(x)),
  // text
  concat: (...a) => flatten(a).map(text).join(""),
  concatenate: (...a) => flatten(a).map(text).join(""),
  left: (s, n = 1) => text(s).slice(0, Math.max(0, Math.trunc(num(n)))),
  right: (s, n = 1) => {
    const k = Math.max(0, Math.trunc(num(n)));
    return k ? text(s).slice(-k) : "";
  },
  mid: (s, start, len) => {
    const st = Math.max(1, Math.trunc(num(start)));
    return text(s).slice(st - 1, st - 1 + Math.max(0, Math.trunc(num(len))));
  },
  len: (s) => text(s).length,
  upper: (s) => text(s).toUpperCase(),
  lower: (s) => text(s).toLowerCase(),
  trim: (s) => text(s).trim(),
  substitute: (s, oldS, newS, which) => {
    const str = text(s);
    const o = text(oldS);
    const nw = text(newS);
    if (!o) return str;
    if (which === undefined) return str.split(o).join(nw);
    const n = Math.trunc(num(which));
    let idx = -1;
    for (let k = 0; k < n; k++) {
      idx = str.indexOf(o, idx + 1);
      if (idx === -1) return str;
    }
    return str.slice(0, idx) + nw + str.slice(idx + o.length);
  },
  value: (s) => num(s),
  // info
  isblank: (v) => v === null || v === undefined || v === "",
  isnumber: (v) => typeof v === "number" && Number.isFinite(v),
  istext: (v) => typeof v === "string",
  // date
  today: () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  datedif: (start, end, unit = "D") => {
    const u = text(unit).toUpperCase();
    const [y0, m0, d0] = text(start).slice(0, 10).split("-").map(Number);
    const [y1, m1, d1] = text(end).slice(0, 10).split("-").map(Number);
    if (u === "Y") return y1 - y0 - (m1 < m0 || (m1 === m0 && d1 < d0) ? 1 : 0);
    if (u === "M") return (y1 - y0) * 12 + (m1 - m0) - (d1 < d0 ? 1 : 0);
    return Math.round((parseDateUTC(end) - parseDateUTC(start)) / 86400000);
  },
  lookup: (key, keys, values) => {
    const ks = Array.isArray(keys) ? keys : [keys];
    const vs = Array.isArray(values) ? values : [values];
    for (let i = 0; i < ks.length; i++) {
      if (ks[i] === key || text(ks[i]) === text(key)) return i < vs.length ? vs[i] : null;
    }
    throw new Error("LOOKUP: not found");
  },
  year: (v) => datePart(v, "year"),
  month: (v) => datePart(v, "month"),
  day: (v) => datePart(v, "day"),
};

/** True if `name` (any case) is a catalog function. */
export const isFunctionName = (name: string): boolean =>
  Object.prototype.hasOwnProperty.call(EXCEL_FUNCTIONS, name.toLowerCase());
