// "Dishes" tab: one row per dish, linked to its place by App ID. Starred dishes fill the place's "Best Dish".
// Dish edits are last-write-wins (no conflict check): each dish is small and usually edited by one person.

function readDishes_() {
  const t = readTable_(DISHES_SHEET, DISH_FIELDS);
  assertColumns_(t.col, DISH_FIELDS, DISHES_SHEET);
  return t;
}

function toDish_(row, col) {
  const dish = toRecord_(row, col);
  dish.best = isChecked_(dish.best);
  delete dish.uniqueName;
  return dish;
}

function listDishes_() {
  const t = readDishes_();
  return t.rows.filter((r) => String(r[t.col.id]).trim()).map((r) => toDish_(r, t.col));
}

function cleanDish_(d) {
  const text = (v, max, label) => {
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (s.length > max) throw new Error(label + ' is too long');
    return s;
  };
  const out = {
    name: text(d.name, 100, 'Dish'),
    price: text(d.price, 50, 'Price'),
    note: text(d.note, 300, 'Note'),
    liked: String(d.liked || ''),
    best: d.best === true,
  };
  if (!out.name) throw new Error('Dish name is required');
  if (['', 'Yes', 'No'].indexOf(out.liked) < 0) throw new Error('Liked must be Yes, No or empty');
  return out;
}

// Creates a dish (no dish.id) or edits one. Returns the dish and the place's Best Dish after the change.
function saveDish_(body) {
  const input = body.dish || {};
  const values = cleanDish_(input);
  const placeKey = String(input.place || '');
  const dishId = String(input.id || '');

  return withLock_(() => {
    const places = readPlaces_();
    const p = findRow_(places, 'id', placeKey);
    const t = readDishes_();
    let n;
    let wasBest = false;
    if (dishId) {
      const i = findRow_(t, 'id', dishId);
      if (String(t.rows[i][t.col.place]) !== placeKey) throw new Error('That dish belongs to another place');
      n = rowNumber_(i);
      wasBest = isChecked_(t.rows[i][t.col.best]);
      ['name', 'price', 'note', 'liked', 'best'].forEach((f) => {
        t.sheet.getRange(n, t.col[f] + 1).setValue(sanitize_(values[f]));
      });
    } else {
      Object.assign(values, {
        id: Utilities.getUuid(),
        place: placeKey,
        uniqueName: places.col.uniqueName === undefined ? '' : places.rows[p][places.col.uniqueName],
        addedAt: new Date(),
      });
      const row = new Array(t.headers.length).fill('');
      Object.keys(values).forEach((f) => {
        if (f !== 'best') row[t.col[f]] = sanitize_(values[f]);
      });
      t.sheet.appendRow(row);
      n = t.sheet.getLastRow();
      const best = t.sheet.getRange(n, t.col.best + 1).insertCheckboxes();
      if (values.best) best.check();
    }
    console.log('saveDish_', placeKey, dishId || 'new');
    const dish = toDish_(readRow_(t, n), t.col);
    return { dish, bestDish: wasBest || values.best ? syncBestDish_(places, p) : places.rows[p][places.col.bestDish] || '' };
  });
}

function deleteDish_(body) {
  const dishId = String(body.id || '');
  return withLock_(() => {
    const t = readDishes_();
    const i = findRow_(t, 'id', dishId);
    const placeKey = String(t.rows[i][t.col.place]);
    const wasBest = isChecked_(t.rows[i][t.col.best]);
    t.sheet.deleteRow(rowNumber_(i));
    console.log('deleteDish_', placeKey, dishId);
    if (!wasBest) return { place: placeKey };
    const places = readPlaces_();
    const p = places.rows.findIndex((r) => String(r[places.col.id]) === placeKey);
    return { place: placeKey, bestDish: p < 0 ? '' : syncBestDish_(places, p) };
  });
}

// Rewrites the place's "Best Dish" from its starred dishes. Call inside the lock.
function syncBestDish_(places, p) {
  const t = readDishes_();
  const placeKey = String(places.rows[p][places.col.id]);
  const best = t.rows
    .filter((r) => String(r[t.col.place]) === placeKey && isChecked_(r[t.col.best]))
    .map((r) => String(r[t.col.name]).trim())
    .join(', ');
  if (places.col.bestDish !== undefined && String(places.rows[p][places.col.bestDish]) !== best) {
    places.sheet.getRange(rowNumber_(p), places.col.bestDish + 1).setValue(sanitize_(best));
  }
  return best;
}

// Keeps the readable UniqueName on dish rows in step with a renamed place. Call inside the lock.
function renameDishes_(placeKey, uniqueName) {
  const t = readDishes_();
  t.rows.forEach((r, i) => {
    if (String(r[t.col.place]) === placeKey) t.sheet.getRange(rowNumber_(i), t.col.uniqueName + 1).setValue(sanitize_(uniqueName));
  });
}
