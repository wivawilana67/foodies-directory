// Editor-only setup helpers. Run from the Apps Script editor; results go to the execution log.

function readHeaders_(sheet) {
  return sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
}

// Logs the real headers and which configured fields were found. Run before the first backfill.
function checkColumns() {
  const headers = readHeaders_(openSheet_());
  Logger.log('Headers in "%s": %s', SHEET_NAME, JSON.stringify(headers));
  const fields = Object.assign({}, USER_FIELDS, APP_FIELDS);
  Object.keys(fields).forEach((f) => {
    Logger.log('%s -> "%s": %s', f, fields[f], headers.indexOf(fields[f]) >= 0 ? 'found' : 'MISSING');
  });
}

// Appends any missing APP_FIELDS headers after the last column. Never moves or renames existing columns.
function addAppColumns() {
  const sheet = openSheet_();
  const headers = readHeaders_(sheet);
  const missing = Object.keys(APP_FIELDS).map((f) => APP_FIELDS[f]).filter((h) => headers.indexOf(h) < 0);
  if (missing.length) {
    const start = sheet.getLastColumn() + 1;
    const extra = start + missing.length - 1 - sheet.getMaxColumns();
    if (extra > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), extra);
    sheet.getRange(HEADER_ROW, start, 1, missing.length).setValues([missing]);
  }
  Logger.log('Added columns: %s', missing.length ? missing.join(', ') : 'none');
}
