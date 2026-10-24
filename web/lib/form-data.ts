/**
 * FormData → plain object for zod, understanding dotted names:
 *
 *   name.tr=DAMLA, name.en=DAMLA       → { name: { tr: "DAMLA", en: "DAMLA" } }
 *   pieces.0.unitCbm=0.8               → { pieces: [{ unitCbm: "0.8" }] }
 *
 * Numeric segments create arrays. Keys starting with "$" (React's internal
 * action fields) are skipped. Repeated plain names keep the last value, like
 * Object.fromEntries.
 */
type Value = FormDataEntryValue | Node;
type Node = { [key: string]: Value } | Value[];

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function formDataToObject(formData: FormData): Record<string, unknown> {
  const root: Record<string, Value> = {};

  for (const [name, value] of formData) {
    if (name.startsWith("$")) continue;
    const path = name.split(".");
    if (path.some((segment) => segment === "" || UNSAFE_KEYS.has(segment))) continue;

    let node: Node = root;
    for (let i = 0; i < path.length; i++) {
      const segment = path[i];
      const isLast = i === path.length - 1;
      const key: string | number = Array.isArray(node) ? Number(segment) : segment;
      if (Array.isArray(node) && (!Number.isInteger(key) || Number(key) < 0 || Number(key) > 999)) {
        break;
      }
      const container = node as Record<string | number, Value>;
      if (isLast) {
        container[key] = value;
      } else {
        const existing = container[key];
        if (typeof existing !== "object" || existing === null || existing instanceof File) {
          container[key] = /^\d+$/.test(path[i + 1]) ? [] : {};
        }
        node = container[key] as Node;
      }
    }
  }

  // Sparse arrays (a row whose inputs were all removed) → dense.
  const densify = (value: Value): unknown => {
    if (Array.isArray(value)) return value.filter((item) => item !== undefined).map(densify);
    if (value && typeof value === "object" && !(value instanceof File)) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, densify(v)]));
    }
    return value;
  };
  return densify(root) as Record<string, unknown>;
}
