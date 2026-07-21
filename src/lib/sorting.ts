export type SortDirection = 'asc' | 'desc';

export interface SortState<Key extends string> {
  key: Key | null;
  direction: SortDirection | null;
}

export type SortableValue = string | number | boolean | null | undefined;

export function emptySort<Key extends string>(): SortState<Key> {
  return { key: null, direction: null };
}

export function cycleSort<Key extends string>(state: SortState<Key>, key: Key): SortState<Key> {
  if (state.key !== key) return { key, direction: 'asc' };
  if (state.direction === 'asc') return { key, direction: 'desc' };
  return emptySort<Key>();
}

function compareValues(left: SortableValue, right: SortableValue) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  return String(left).localeCompare(String(right), 'es', { numeric: true, sensitivity: 'base' });
}

export function sortItems<Item, Key extends string>(
  items: Item[],
  state: SortState<Key>,
  valueFor: (item: Item, key: Key) => SortableValue,
) {
  if (!state.key || !state.direction) return [...items];
  const multiplier = state.direction === 'asc' ? 1 : -1;
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const comparison = compareValues(valueFor(left.item, state.key as Key), valueFor(right.item, state.key as Key));
      return comparison ? comparison * multiplier : left.index - right.index;
    })
    .map(({ item }) => item);
}
