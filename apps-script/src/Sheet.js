// Reads and writes the "Food List" and "Master" tabs. Columns are found by header text, never by position.

let ss_;

function spreadsheet_() {
  if (!ss_) ss_ = SpreadsheetApp.openById(getProp_(PROP.sheetId));
  return ss_;
}

function openTab_(name) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Tab not found: ' + name + '; run setupSheet()');
  return sheet;
}

// Collapses line breaks and repeated spaces, so the old "Review\n(Name)" header matches "Review (Name)".
function normHeader_(h) {
  return String(h).replace(/\s+/g, ' ').trim();
}

// Returns {sheet, headers, col, rows}; col maps logical field -> 0-based column for every header found.
function readTable_(tabName, fields) {
  const sheet = openTab_(tabName);
  const values = sheet.getDataRange().getValues();
  const headers = (values[HEADER_ROW - 1] || []).map(normHeader_);
  const col = {};
  Object.keys(fields).forEach((f) => {
    const i = headers.indexOf(fields[f]);
    if (i >= 0) col[f] = i;
  });
  return { sheet, headers, col, rows: values.slice(HEADER_ROW) };
}

function readPlaces_() {
  const fields = Object.assign(placeFields_(), APP_FIELDS);
  const t = readTable_(SHEET_NAME, fields);
  if (t.col.name === undefined) throw new Error('Header "' + fields.name + '" not found; run checkColumns()');
  return t;
}

function assertColumns_(col, fields, tabName) {
  const missing = Object.keys(fields).filter((f) => col[f] === undefined).map((f) => fields[f]);
  if (missing.length) throw new Error('Missing columns in ' + tabName + ' (' + missing.join(', ') + '); run setupSheet() or addAppColumns()');
}

function rowNumber_(index) {
  return HEADER_ROW + 1 + index;
}

// Index of the row whose `field` equals id, or an error the phone can show.
function findRow_(t, field, id) {
  const i = id ? t.rows.findIndex((r) => String(r[t.col[field]]) === id) : -1;
  if (i < 0) throw new Error('Not found; refresh and try again');
  return i;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function toRecord_(row, col) {
  const rec = {};
  Object.keys(col).forEach((f) => {
    const v = row[col[f]];
    rec[f] = v instanceof Date ? v.toISOString() : v;
  });
  return rec;
}

function rowToPlace_(row, col) {
  const place = toRecord_(row, col);
  CHECKBOX_FIELDS.forEach((f) => {
    if (f in place) place[f] = isChecked_(place[f]);
  });
  return place;
}

function readRow_(t, rowNumber) {
  return t.sheet.getRange(rowNumber, 1, 1, t.headers.length).getValues()[0];
}

// A checkbox cell, or text such as "yes" / "sudah" typed by hand.
function isChecked_(value) {
  return value === true || /^(yes|y|true|sudah)$/i.test(String(value).trim());
}

// Neutralize formula injection in text written to the sheet.
function sanitize_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

// Value as the edit conflict check compares it.
function comparable_(field, value) {
  if (CHECKBOX_FIELDS.indexOf(field) >= 0) return String(isChecked_(value));
  return String(value === null || value === undefined ? '' : value).trim();
}

// App-owned cells for a place returned by toPlace_().
function appCells_(place) {
  return {
    placeId: place.placeId,
    lat: place.lat,
    lng: place.lng,
    address: place.address,
    googleCategory: place.googleCategory,
  };
}

// "Name - Country (Patokan)", the old sheet's format.
function uniqueName_(v) {
  return v.name + (v.country ? ' - ' + v.country : '') + (v.landmark ? ' (' + v.landmark + ')' : '');
}

// Hyperlink column: the name as a rich-text link to Google Maps (no formula).
function setHyperlink_(sheet, rowNumber, col, name, url) {
  if (col.hyperlink === undefined || !name) return;
  const rich = SpreadsheetApp.newRichTextValue().setText(String(name));
  if (/^https:\/\//.test(url)) rich.setLinkUrl(url);
  sheet.getRange(rowNumber, col.hyperlink + 1).setRichTextValue(rich.build());
}

function setCheckboxes_(sheet, rowNumber, col, values) {
  CHECKBOX_FIELDS.forEach((f) => {
    if (col[f] === undefined) return;
    const cell = sheet.getRange(rowNumber, col[f] + 1).insertCheckboxes();
    if (values[f]) cell.check();
  });
}

// Validates fields sent by the phone and returns them cleaned. Unknown fields are refused.
function cleanFields_(input, options) {
  const out = {};
  Object.keys(input || {}).forEach((f) => {
    if (EDITABLE_FIELDS.indexOf(f) < 0) throw new Error('Field cannot be edited: ' + f);
    out[f] = cleanValue_(f, input[f], options);
  });
  return out;
}

function cleanValue_(f, v, options) {
  if (CHECKBOX_FIELDS.indexOf(f) >= 0) return v === true;
  let s = String(v === null || v === undefined ? '' : v).trim();
  if (s.length > (/^review/.test(f) ? 1000 : 200)) throw new Error(f + ' is too long');
  if (/^rating/.test(f) && s && options.rating.indexOf(s) < 0) throw new Error('Unknown rating: ' + s);
  if (f === 'instagram' && s) {
    if (/^@?[\w.]{1,30}$/.test(s)) s = 'https://www.instagram.com/' + s.replace(/^@/, '') + '/';
    if (!/^https:\/\/(www\.|m\.)?instagram\.com\//i.test(s)) throw new Error('Instagram must be an https://instagram.com link or @name');
  }
  if (f === 'mapsLink' && s && !(/^https:\/\//i.test(s) && (isMapsUrl_(s) || /^https:\/\/share\.google\//i.test(s)))) {
    throw new Error('Google link must be a Google Maps link');
  }
  return s;
}

function readOptions_() {
  const t = readTable_(MASTER_SHEET, MASTER_FIELDS);
  const options = {};
  Object.keys(MASTER_FIELDS).forEach((f) => {
    options[f] = t.col[f] === undefined ? [] : t.rows.map((r) => String(r[t.col[f]]).trim()).filter(Boolean);
  });
  return options;
}

// Appends new Tipe / Genre / Jenis values to their "Master" list. Call inside the lock.
function appendOptions_(values, options) {
  const fresh = OPTION_FIELDS.filter((f) => values[f] && options[f].indexOf(values[f]) < 0);
  if (!fresh.length) return;
  const t = readTable_(MASTER_SHEET, MASTER_FIELDS);
  fresh.forEach((f) => {
    const c = t.col[f];
    if (c === undefined) return;
    let next = t.rows.length;
    while (next > 0 && String(t.rows[next - 1][c]).trim() === '') next--;
    t.sheet.getRange(rowNumber_(next), c + 1).setValue(sanitize_(values[f]));
    options[f].push(values[f]);
  });
}

// Gives rows typed straight into the sheet an App ID, so the phone can edit them and add dishes.
// Fills empty app-owned cells only.
function ensureIds_(t) {
  const missing = [];
  t.rows.forEach((r, i) => {
    if (String(r[t.col.name]).trim() && r[t.col.id] === '') missing.push(i);
  });
  if (!missing.length) return;
  withLock_(() => {
    const fresh = readPlaces_();
    missing.forEach((i) => {
      const row = fresh.rows[i];
      if (!row || row[fresh.col.id] !== '' || row[fresh.col.name] !== t.rows[i][t.col.name]) return;
      const id = Utilities.getUuid();
      fresh.sheet.getRange(rowNumber_(i), fresh.col.id + 1).setValue(id);
      t.rows[i][t.col.id] = id;
    });
  });
  console.log('ensureIds_', missing.length);
}

function listPlaces_() {
  const t = readPlaces_();
  assertColumns_(t.col, APP_FIELDS, SHEET_NAME);
  ensureIds_(t);
  const places = [];
  t.rows.forEach((r) => {
    if (String(r[t.col.name]).trim()) places.push(rowToPlace_(r, t.col));
  });
  return { places, dishes: listDishes_(), options: readOptions_(), people: people_(), fields: Object.keys(t.col) };
}

// Adds a place. With a placeId (picked from lookup_), Google data comes from the server's lookup cache, so
// the phone never sends place data to write; the phone's own fields win over Google's defaults.
// Without a placeId it is a manual place (name required).
function addPlace_(body) {
  const placeId = String(body.placeId || '');
  const google = placeId ? (getCachedPlace_(placeId) || getPlace_(placeId)) : null;
  const options = readOptions_();
  const fields = cleanFields_(body.fields, options);
  const values = google
    ? { name: google.name, country: google.country, city: google.city, district: google.district, mapsLink: google.mapsUrl }
    : {};
  Object.keys(fields).forEach((f) => {
    if (fields[f] !== '') values[f] = fields[f];
  });
  if (!values.name) throw new Error('Name is required');
  Object.assign(values, google ? appCells_(google) : {}, {
    uniqueName: uniqueName_(values),
    id: Utilities.getUuid(),
    addedAt: new Date(),
    lookupStatus: google ? 'added' : 'manual',
  });

  return withLock_(() => {
    const t = readPlaces_();
    assertColumns_(t.col, APP_FIELDS, SHEET_NAME);
    const dupe = google ? t.rows.findIndex((r) => r[t.col.placeId] === google.placeId) : -1;
    if (dupe >= 0) return { duplicate: true, place: rowToPlace_(t.rows[dupe], t.col) };

    appendOptions_(values, options);
    const row = new Array(t.headers.length).fill('');
    Object.keys(values).forEach((f) => {
      if (t.col[f] !== undefined && CHECKBOX_FIELDS.indexOf(f) < 0) row[t.col[f]] = sanitize_(values[f]);
    });
    t.sheet.appendRow(row);
    const n = t.sheet.getLastRow();
    setHyperlink_(t.sheet, n, t.col, values.name, values.mapsLink);
    setCheckboxes_(t.sheet, n, t.col, values);
    console.log('addPlace_', values.id, google ? google.placeId : 'manual');
    return { duplicate: false, place: rowToPlace_(readRow_(t, n), t.col) };
  });
}

// Edits user cells of one place. `original` holds the values the phone started from; if any changed
// cell no longer matches it (edited on the other phone or in the sheet), nothing is written.
function updatePlace_(body) {
  const id = String(body.id || '');
  const options = readOptions_();
  const changes = cleanFields_(body.changes, options);
  const original = body.original || {};
  const names = Object.keys(changes);
  if (!names.length) throw new Error('Nothing to save');

  return withLock_(() => {
    const t = readPlaces_();
    assertColumns_(t.col, APP_FIELDS, SHEET_NAME);
    const n = rowNumber_(findRow_(t, 'id', id));
    const current = rowToPlace_(readRow_(t, n), t.col);
    names.forEach((f) => {
      if (t.col[f] === undefined) throw new Error('Column missing for ' + f + '; run checkColumns()');
      if (comparable_(f, current[f]) !== comparable_(f, original[f])) {
        throw new Error('This place was changed somewhere else. Refresh and try again.');
      }
    });
    appendOptions_(changes, options);
    names.forEach((f) => {
      if (comparable_(f, current[f]) !== comparable_(f, changes[f])) {
        t.sheet.getRange(n, t.col[f] + 1).setValue(sanitize_(changes[f]));
      }
    });

    if (['name', 'country', 'landmark', 'mapsLink'].some((f) => f in changes)) {
      const next = Object.assign({}, current, changes);
      const unique = uniqueName_(next);
      if (t.col.uniqueName !== undefined && unique !== current.uniqueName) {
        t.sheet.getRange(n, t.col.uniqueName + 1).setValue(sanitize_(unique));
        renameDishes_(id, unique);
      }
      setHyperlink_(t.sheet, n, t.col, next.name, next.mapsLink);
    }
    console.log('updatePlace_', id, names.join(','));
    return { place: rowToPlace_(readRow_(t, n), t.col) };
  });
}
