// Web app entry points. The phone sends POST with Content-Type text/plain and a JSON body
// {action, token, ...} so the browser makes no CORS preflight (Apps Script cannot answer one).

const ACTIONS = {
  list: () => listPlaces_(),
  lookup: (body) => lookup_(body),
  add: (body) => addPlace_(body),
};

function doGet() {
  return json_({ ok: true });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Bad JSON' });
  }
  try {
    assertToken_(body.token);
    const handler = ACTIONS[body.action];
    if (!handler) throw new Error('Unknown action');
    console.log('doPost', body.action);
    return json_(Object.assign({ ok: true }, handler(body)));
  } catch (err) {
    console.error('doPost', body.action, err && err.stack ? err.stack : err);
    return json_({ ok: false, error: err.message });
  }
}

function assertToken_(token) {
  if (typeof token !== 'string' || token !== getProp_(PROP.token)) throw new Error('Unauthorized');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
