// Editor-only setup helpers. Run from the Apps Script editor; results go to the execution log.

function readHeaders_(sheet) {
  if (!sheet.getLastColumn()) return [];
  return sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0].map(normHeader_);
}

// Appends the headers missing from the header row after the last column. Never moves or renames columns.
function appendHeaders_(sheet, headers) {
  const have = readHeaders_(sheet);
  const missing = headers.filter((h) => have.indexOf(h) < 0);
  if (missing.length) {
    const start = sheet.getLastColumn() + 1;
    const extra = start + missing.length - 1 - sheet.getMaxColumns();
    if (extra > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), extra);
    sheet.getRange(HEADER_ROW, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
  return missing;
}

const headerList_ = (fields) => Object.keys(fields).map((f) => fields[f]);

// First run on a new spreadsheet: writes the "Food List" header row (old sheet names + app columns) and
// creates the "Dishes" and "Master" tabs. Refuses if "Food List" has data rows; other tabs keep their headers.
function setupSheet() {
  const ss = spreadsheet_();
  const tab = (name) => ss.getSheetByName(name) || ss.insertSheet(name);
  const food = tab(SHEET_NAME);
  if (food.getLastRow() > HEADER_ROW) throw new Error('"' + SHEET_NAME + '" has data rows; use addMissingColumns() instead');
  if (food.getLastColumn()) food.getRange(HEADER_ROW, 1, 1, food.getLastColumn()).clearContent();
  [[food, Object.assign(placeFields_(), APP_FIELDS)], [tab(DISHES_SHEET), DISH_FIELDS], [tab(MASTER_SHEET), MASTER_FIELDS]]
    .forEach(([sheet, fields]) => {
      const added = appendHeaders_(sheet, headerList_(fields));
      sheet.setFrozenRows(HEADER_ROW);
      Logger.log('%s: added %s', sheet.getName(), added.join(', ') || 'none');
    });
}

// Logs, per tab, which configured headers were found. Run after setupSheet or a migration.
function checkColumns() {
  [[SHEET_NAME, Object.assign(placeFields_(), APP_FIELDS)], [DISHES_SHEET, DISH_FIELDS], [MASTER_SHEET, MASTER_FIELDS]]
    .forEach(([name, fields]) => {
      const headers = readHeaders_(openTab_(name));
      Logger.log('Headers in "%s": %s', name, JSON.stringify(headers));
      Object.keys(fields).forEach((f) => {
        Logger.log('%s -> "%s": %s', f, fields[f], headers.indexOf(fields[f]) >= 0 ? 'found' : 'MISSING');
      });
    });
}

// For a "Food List" that already has data (a new column such as Labels, or the old sheet at migration):
// appends every configured header that is missing, after the last column. Existing columns are untouched.
function addMissingColumns() {
  const added = appendHeaders_(openTab_(SHEET_NAME), headerList_(Object.assign(placeFields_(), APP_FIELDS)));
  Logger.log('Added columns: %s', added.length ? added.join(', ') : 'none');
}
