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

// For tabs that already have data (a new column such as Photos, or the old sheet at migration): appends every
// configured header missing from "Food List" and "Dishes", after the last column. Existing columns are untouched.
function addMissingColumns() {
  [[SHEET_NAME, Object.assign(placeFields_(), APP_FIELDS)], [DISHES_SHEET, DISH_FIELDS]].forEach(([name, fields]) => {
    const added = appendHeaders_(openTab_(name), headerList_(fields));
    Logger.log('%s: added %s', name, added.length ? added.join(', ') : 'none');
  });
}

// Once, before the first photo: creates the "Foodies Photos - <sheet name>" Drive folder and stores its ID in PHOTO_FOLDER_ID.
// The first run asks for Drive access.
function setupPhotos() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP.photoFolder)) {
    Logger.log('PHOTO_FOLDER_ID is already set');
    return;
  }
  const name = 'Foodies Photos - ' + spreadsheet_().getName(); // live and test sheets get separate folders
  props.setProperty(PROP.photoFolder, DriveApp.createFolder(name).getId());
  Logger.log('Created the "%s" folder in your Drive', name);
}
