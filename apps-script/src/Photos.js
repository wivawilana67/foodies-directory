// Own photos of places and dishes: JPEG files in the Drive folder PHOTO_FOLDER_ID, shared "anyone with the link"
// so the phone can show them. The row's "Photos" cell holds their Drive file IDs, comma-separated; the first is the cover.

const PHOTO_ID = /^[\w-]{10,200}$/;

function photoIds_(cell) {
  return String(cell || '').split(',').map((s) => s.trim()).filter((s) => PHOTO_ID.test(s));
}

// Base64 from the phone -> bytes. Only JPEG (starts FF D8 FF; Apps Script bytes are signed) up to MAX_PHOTO_BYTES.
function decodePhoto_(data) {
  if (typeof data !== 'string' || !data) throw new Error('No photo');
  if (data.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) throw new Error('Photo is too large');
  let bytes;
  try {
    bytes = Utilities.base64Decode(data);
  } catch (err) {
    throw new Error('Bad photo data');
  }
  if (bytes.length < 3 || (bytes[0] & 0xff) !== 0xff || (bytes[1] & 0xff) !== 0xd8 || (bytes[2] & 0xff) !== 0xff) {
    throw new Error('Only JPEG photos are accepted');
  }
  return bytes;
}

// The place or dish row a photo action targets. Call inside the lock.
function photoRow_(target, id) {
  if (target === 'place') {
    const t = readPlaces_();
    assertColumns_(t.col, { photos: APP_FIELDS.photos }, SHEET_NAME);
    return { target, t, i: findRow_(t, 'id', id), record: (row) => rowToPlace_(row, t.col) };
  }
  if (target === 'dish') {
    const t = readDishes_();
    return { target, t, i: findRow_(t, 'id', id), record: (row) => toDish_(row, t.col) };
  }
  throw new Error('Bad photo target');
}

// Writes the Photos cell and returns {place} or {dish} as the phone stores it.
function writePhotos_(r, ids) {
  const n = rowNumber_(r.i);
  r.t.sheet.getRange(n, r.t.col.photos + 1).setValue(sanitize_(ids.join(',')));
  return { [r.target]: r.record(readRow_(r.t, n)) };
}

function addPhoto_(body) {
  const id = String(body.id || '');
  const bytes = decodePhoto_(body.data);
  return withLock_(() => {
    const r = photoRow_(String(body.target || ''), id);
    const ids = photoIds_(r.t.rows[r.i][r.t.col.photos]);
    if (ids.length >= MAX_PHOTOS) throw new Error('Up to ' + MAX_PHOTOS + ' photos each');
    const file = DriveApp.getFolderById(getProp_(PROP.photoFolder))
      .createFile(Utilities.newBlob(bytes, 'image/jpeg', id + '-' + Date.now() + '.jpg'));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    console.log('addPhoto_', r.target, id);
    return writePhotos_(r, ids.concat(file.getId()));
  });
}

// Removes the photo from its row, then moves the file to Drive's trash (recoverable for 30 days).
function deletePhoto_(body) {
  const id = String(body.id || '');
  const photoId = String(body.photoId || '');
  return withLock_(() => {
    const r = photoRow_(String(body.target || ''), id);
    const ids = photoIds_(r.t.rows[r.i][r.t.col.photos]);
    if (ids.indexOf(photoId) < 0) throw new Error('Not found; refresh and try again');
    const result = writePhotos_(r, ids.filter((x) => x !== photoId));
    trashPhotos_([photoId]);
    console.log('deletePhoto_', r.target, id);
    return result;
  });
}

// A file that is already gone is logged, not an error: the sheet is the source of truth.
function trashPhotos_(ids) {
  ids.forEach((photoId) => {
    try {
      DriveApp.getFileById(photoId).setTrashed(true);
    } catch (err) {
      console.error('trashPhotos_', err && err.message);
    }
  });
}
