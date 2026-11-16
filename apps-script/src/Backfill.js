// Editor-only backfill. Each run handles up to BACKFILL_BATCH rows that have a name but no Place ID
// and no Lookup Status, so it is resumable: run it again until it logs 0 remaining.
// It fills empty app-owned cells only and never overwrites anything already in the sheet.

function backfillBatch() {
  const started = Date.now();
  const t = readPlaces_();
  assertColumns_(t.col, APP_FIELDS, SHEET_NAME);
  const todo = [];
  t.rows.forEach((r, i) => {
    if (String(r[t.col.name]).trim() && r[t.col.placeId] === '' && r[t.col.lookupStatus] === '') todo.push(i);
  });

  const fills = [];
  for (const i of todo.slice(0, BACKFILL_BATCH)) {
    if (Date.now() - started > BACKFILL_TIME_BUDGET_MS) break;
    const name = t.rows[i][t.col.name];
    try {
      const place = findPlaceForRow_(t.rows[i], t.col);
      fills.push({ index: i, name: name, place: place, status: place ? 'ok' : 'not found' });
    } catch (err) {
      if (/limit reached/.test(err.message)) {
        console.warn('backfillBatch stopped:', err.message);
        break;
      }
      console.error('backfillBatch row', rowNumber_(i), err.message);
      fills.push({ index: i, name: name, place: null, status: 'error: ' + err.message });
    }
  }

  writeFills_(fills);
  Logger.log('Backfilled %s rows, %s remaining', fills.length, todo.length - fills.length);
}

// A real Maps link in the row wins; otherwise search "<name> <city>".
function findPlaceForRow_(row, col) {
  const link = col.mapsLink !== undefined ? extractUrl_(row[col.mapsLink]) : '';
  if (link && isMapsUrl_(link)) {
    const places = placeFromLink_(link, 1);
    if (places) return places[0] || null;
  }
  const city = col.city !== undefined ? String(row[col.city]).trim() : '';
  return searchText_((String(row[col.name]).trim() + ' ' + city).trim(), null, 1)[0] || null;
}

// Writes cell by cell on purpose: writing whole rows back would flatten formulas, rich-text links
// and anything edited since the read.
function writeFills_(fills) {
  if (!fills.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = readPlaces_();
    fills.forEach((f) => {
      const row = t.rows[f.index];
      if (!row || row[t.col.name] !== f.name) {
        console.warn('writeFills_ skipped, row moved:', f.name);
        return;
      }
      const cells = Object.assign(f.place ? appCells_(f.place) : {}, { lookupStatus: f.status });
      Object.keys(cells).forEach((k) => {
        const c = t.col[k];
        if (row[c] === '' && cells[k] !== '') t.sheet.getRange(rowNumber_(f.index), c + 1).setValue(sanitize_(cells[k]));
      });
    });
  } finally {
    lock.releaseLock();
  }
}
