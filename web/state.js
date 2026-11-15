// In-memory data from the last `list`, plus a change hook that re-renders lists and saves the offline copy.

export const state = {
  places: [],
  dishes: [],
  options: { rating: [], tipe: [], genre: [], jenis: [] },
  people: ['', ''],
  fields: [],
  tab: 'all',
  here: null,
  current: null, // App ID of the open place
};

const listeners = [];
export const onChange = (fn) => listeners.push(fn);
export const changed = () => listeners.forEach((fn) => fn());

export const placeById = (id) => state.places.find((p) => p.id === id);
export const dishesOf = (id) => state.dishes.filter((d) => d.place === id);

export function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}
