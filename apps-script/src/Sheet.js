// Reads and writes the "Food List" tab. Columns are found by header text, never by position.

function openSheet_() {
  const sheet = SpreadsheetApp.openById(getProp_(PROP.sheetId)).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Tab not found: ' + SHEET_NAME);
  return sheet;
}

// Returns {sheet, headers, col, rows}; col maps logical field -> 0-based column for every header found.
function readTable_() {
  const sheet = openSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[HEADER_ROW - 1].map((h) => String(h).trim());
  const fields = Object.assign({}, USER_FIELDS, APP_FIELDS);
  const col = {};
  Object.keys(fields).forEach((f) => {
    const i = headers.indexOf(fields[f]);
    if (i >= 0) col[f] = i;
  });
  if (col.name === undefined) throw new Error('Header "' + USER_FIELDS.name + '" not found; run checkColumns()');
  return { sheet, headers, col, rows: values.slice(HEADER_ROW) };
}

function assertAppColumns_(col) {
  const missing = Object.keys(APP_FIELDS).filter((f) => col[f] === undefined);
  if (missing.length) throw new Error('Missing app columns (' + missing.join(', ') + '); run addAppColumns()');
}

function rowNumber_(index) {
  return HEADER_ROW + 1 + index;
}

function rowToPlace_(row, col, rowNumber) {
  const place = { row: rowNumber };
  Object.keys(col).forEach((f) => {
    const v = row[col[f]];
    place[f] = v instanceof Date ? v.toISOString() : v;
  });
  if ('tried' in place) place.tried = isTried_(place.tried);
  return place;
}

// Unverified: the real format of the "tried" column (checkbox or text) is not confirmed yet.
function isTried_(value) {
  return value === true || /^(yes|y|true|sudah)$/i.test(String(value).trim());
}

// Neutralize formula injection in text written to the sheet.
function sanitize_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

// App-owned cells for a place returned by toPlace_().
function appCells_(place) {
  return {
    placeId: place.placeId,
    lat: place.lat,
    lng: place.lng,
    address: place.address,
    area: place.area,
    googleCategory: place.googleCategory,
    mapsUrl: place.mapsUrl,
  };
}

function listPlaces_() {
  const t = readTable_();
  const places = [];
  t.rows.forEach((r, i) => {
    if (String(r[t.col.name]).trim()) places.push(rowToPlace_(r, t.col, rowNumber_(i)));
  });
  return { places, fields: Object.keys(t.col) };
}

// Adds a place picked from lookup_(). Uses the cached lookup result, so the phone sends only the place ID.
function addPlace_(body) {
  const placeId = String(body.placeId || '');
  const place = getCachedPlace_(placeId) || getPlace_(placeId);
  const labels = body.labels || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = readTable_();
    assertAppColumns_(t.col);
    const dupe = t.rows.findIndex((r) => r[t.col.placeId] === place.placeId);
    if (dupe >= 0) return { duplicate: true, place: rowToPlace_(t.rows[dupe], t.col, rowNumber_(dupe)) };

    const cells = Object.assign(
      { name: place.name, link: place.mapsUrl, city: place.area, lookupStatus: 'added' },
      appCells_(place)
    );
    LABEL_FIELDS.forEach((f) => {
      const v = String(labels[f] || '').trim().slice(0, 100);
      if (v) cells[f] = v;
    });
    const row = new Array(t.headers.length).fill('');
    Object.keys(cells).forEach((f) => {
      if (t.col[f] !== undefined) row[t.col[f]] = sanitize_(cells[f]);
    });
    t.sheet.appendRow(row);
    console.log('addPlace_', place.placeId);
    return { duplicate: false, place: rowToPlace_(row, t.col, t.sheet.getLastRow()) };
  } finally {
    lock.releaseLock();
  }
}
