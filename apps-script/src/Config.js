// Config: sheet layout, Script Property names and limits. Secrets live only in Script Properties.

const SHEET_NAME = 'Food List';
const DISHES_SHEET = 'Dishes';
const MASTER_SHEET = 'Master';
const HEADER_ROW = 1;

// "Food List" columns in sheet order: logical field -> header text (the old sheet's names).
// Per-person headers use the two names in Script Property PEOPLE, so names stay out of this public repo.
function placeFields_() {
  const p = people_();
  return {
    uniqueName: 'UniqueName',
    name: 'Nama Resto',
    hyperlink: 'Hyperlink',
    country: 'Negara',
    city: 'Kota',
    district: 'Lokasi',
    landmark: 'Jalan / Patokan',
    rating1: 'Rating (' + p[0] + ')',
    rating2: 'Rating (' + p[1] + ')',
    price: 'Range Harga (Per Orang)',
    tipe: 'Tipe Foodies',
    genre: 'Genre Foodies',
    jenis: 'Jenis Foodies',
    labels: 'Labels',
    bestDish: 'Best Dish',
    review1: 'Review (' + p[0] + ')',
    review2: 'Review (' + p[1] + ')',
    instagram: 'Link Instagram',
    mapsLink: 'Link Google',
    closed: 'Closed',
    tried: 'Have Tried?',
  };
}

// Columns the app fills from Google and bookkeeping, appended right of the user columns.
const APP_FIELDS = {
  id: 'App ID',
  placeId: 'Place ID',
  lat: 'Lat',
  lng: 'Lng',
  address: 'Address',
  googleCategory: 'Google Category',
  addedAt: 'Added At',
  lookupStatus: 'Lookup Status',
};

const DISH_FIELDS = {
  id: 'Dish ID',
  place: 'App ID',
  uniqueName: 'UniqueName',
  name: 'Dish',
  price: 'Price',
  liked: 'Liked',
  best: 'Best',
  note: 'Note',
  addedAt: 'Added At',
};

// "Master" lists. The order of Ratings is the sort rank (last = best).
const MASTER_FIELDS = {
  rating: 'Ratings',
  tipe: 'Tipe Foodies',
  genre: 'Genre Foodies',
  jenis: 'Jenis Foodies',
};

// Place fields the phone may set. UniqueName, Hyperlink and Best Dish are derived by the server.
const EDITABLE_FIELDS = ['name', 'country', 'city', 'district', 'landmark', 'rating1', 'rating2', 'price',
  'tipe', 'genre', 'jenis', 'labels', 'review1', 'review2', 'instagram', 'mapsLink', 'closed', 'tried'];
const CHECKBOX_FIELDS = ['closed', 'tried'];
const OPTION_FIELDS = ['tipe', 'genre', 'jenis'];

const PROP = {
  apiKey: 'PLACES_API_KEY',
  token: 'API_TOKEN',
  sheetId: 'SPREADSHEET_ID',
  people: 'PEOPLE',
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

// The two people, from Script Property PEOPLE ("Name1,Name2").
function people_() {
  const names = getProp_(PROP.people).split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length !== 2) throw new Error('Script Property PEOPLE must hold two names separated by a comma');
  return names;
}
