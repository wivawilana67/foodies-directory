// Shapes of the API's JSON (api/foodies/payload.py). Keep in sync with api/CLAUDE.md section 3.

export type Person = { id: number; name: string; position: number };

export type Rating = { score: string; review: string };

export type Place = {
  id: string;
  name: string;
  country: string;
  city: string;
  district: string;
  landmark: string;
  price: string;
  type: string;
  genre: string;
  category: string;
  labels: string[];
  bestDish: string;
  instagram: string;
  mapsLink: string;
  closed: boolean;
  tried: boolean;
  placeId: string;
  lat: number | null;
  lng: number | null;
  address: string;
  googleCategory: string;
  lookupStatus: string;
  addedAt: string;
  version: number;
  ratings: Record<string, Rating>; // keyed by Person id
};

export type Dish = {
  id: string;
  place: string;
  name: string;
  price: string;
  liked: '' | 'Yes' | 'No';
  best: boolean;
  note: string;
  addedAt: string;
};

export type Collection = {
  id: string;
  name: string;
  note: string;
  version: number;
  createdBy: number | null;
  createdAt: string;
  placeIds: string[];
};

export type Options = { rating: string[]; type: string[]; genre: string[]; category: string[] };

// GET /api/bootstrap; `me` is the signed-in Person's id.
export type Data = {
  people: Person[];
  options: Options;
  places: Place[];
  dishes: Dish[];
  collections: Collection[];
  me: number;
};

// One result of POST /api/lookup (api/foodies/places.py). Adding it sends only `placeId`; the server takes the
// Google data from its own cache (D12).
export type LookupResult = {
  placeId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  country: string;
  city: string;
  district: string;
  googleCategory: string;
  mapsUrl: string;
};
