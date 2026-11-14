// Config: sheet layout, Script Property names and limits. Secrets live only in Script Properties.

const SHEET_NAME = 'Food List';
const HEADER_ROW = 1; // Unverified: confirm with checkColumns() before the first backfill.

// Logical field -> header text in "Food List". These header names are unverified guesses;
// run checkColumns() and fix them here. Only `name` is required; any other missing header is skipped.
const USER_FIELDS = {
  name: 'Name',
  link: 'Link',
  city: 'City',
  tipe: 'Tipe',
  genre: 'Genre',
  jenis: 'Jenis',
  heaven: 'HEAVEN',
  price: 'Price',
  tried: 'Tried',
};

// Columns this app owns. addAppColumns() appends any missing ones after the last column.
const APP_FIELDS = {
  placeId: 'Place ID',
  lat: 'Lat',
  lng: 'Lng',
  address: 'Address',
  area: 'Area',
  googleCategory: 'Google Category',
  mapsUrl: 'Google Maps URL',
  lookupStatus: 'Lookup Status',
};

// User label fields the phone may send with a new place.
const LABEL_FIELDS = ['tipe', 'genre', 'jenis'];

const PROP = {
  apiKey: 'PLACES_API_KEY',
  token: 'API_TOKEN',
  sheetId: 'SPREADSHEET_ID',
  dailyLimit: 'DAILY_LIMIT',
  monthlyLimit: 'MONTHLY_LIMIT',
  usage: 'USAGE',
};

const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_MONTHLY_LIMIT = 900;
const LOOKUP_CACHE_SECONDS = 600;
const BACKFILL_BATCH = 15;
const BACKFILL_TIME_BUDGET_MS = 4.5 * 60 * 1000;

function getProp_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('Script Property ' + key + ' is not set');
  return value;
}
