export type DeepFieldDiff =
  | { from: any; to: any }
  | { [key: string]: DeepFieldDiff };

export function buildFieldDiffDeep<T extends Record<string, any>>(
  before: T,
  after: T,
  fields: (keyof T)[],
): Record<string, DeepFieldDiff> {
  const result: Record<string, DeepFieldDiff> = {};

  for (const key of fields) {
    const oldVal = before[key];
    const newVal = after[key];

    const isObject = (val: any) =>
      typeof val === 'object' && val !== null && !Array.isArray(val);

    if (isObject(oldVal) && isObject(newVal)) {
      const subDiff = buildFieldDiffDeep(
        oldVal,
        newVal,
        Object.keys({ ...oldVal, ...newVal }) as (keyof T)[],
      );
      if (Object.keys(subDiff).length > 0) {
        result[key as string] = subDiff;
      }
    } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        result[key as string] = { from: oldVal, to: newVal };
      }
    } else if (oldVal !== newVal) {
      result[key as string] = { from: oldVal ?? null, to: newVal ?? null };
    }
  }

  return result;
}
