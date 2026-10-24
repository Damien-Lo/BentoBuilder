import { File } from "expo-file-system";

import { API_BASE_URL } from "@/src/config/api";
import type { PartialNutrition } from "@/src/types/nutrition";

// Restaurants — public, built up by everyone (server/routes/RestaurantRoutes.js):
// one record per real place, its menu (its own dishes, or its chain's), and
// reviewed: what a member adds waits ("pending") until a reviewer approves it
// — they can use and log it meanwhile — and a change to what's already
// there is a suggestion (`Suggested`) until approved. A reviewer's changes
// are made at once. Every change made is kept in the item's history. What's one's own — whether it's in
// one's list, notes, ratings, what one paid — comes back as `mine` and is
// changed with the `…Mine` calls. (Replaces restaurantMealApi.ts, where each
// account had its own private copy.)

export type DishNutrition = PartialNutrition;

export interface DishScore {
  _id: string;
  value: number;
  ratedAt: string;
  mealPlanEntry?: string | null;
}

// One's own side of a restaurant or dish.
export interface RestaurantMine {
  saved: boolean;
  notes: string;
}
export interface DishMine extends RestaurantMine {
  price: number | null;
  scores: DishScore[];
}

export interface HistoryEntry {
  at: string;
  by?: { _id: string; name?: string } | string | null;
  // { field: [before, after] }
  changes: Record<string, [unknown, unknown]>;
  note?: string;
}

// Reviewed: one added by a member waits ("pending", seen only by them) until
// a reviewer approves or rejects it (`reviewNote` says why).
export type ReviewStatus = "approved" | "pending" | "rejected";

export interface RestaurantDish {
  _id: string;
  status?: ReviewStatus;
  reviewNote?: string;
  restaurant?: string | null;
  chain?: string | null;
  name: string;
  section?: string;
  // One serving as it's served.
  nutrition: DishNutrition;
  // Where its numbers came from.
  source: "library" | "photo" | "label" | "chain" | "typed";
  // Picked from the dish library at this size (so it can be re-sized).
  fromLibrary?: { dish: string; amount: number; unit: string } | null;
  addedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  mine: DishMine;
}

export interface Restaurant {
  _id: string;
  status?: ReviewStatus;
  reviewNote?: string;
  name: string;
  cuisine?: string;
  // A chain location: its chain's menu is its menu.
  chain?: string | { _id: string; name: string; website?: string } | null;
  chainName?: string | null;
  address?: string;
  // GeoJSON: coordinates are [longitude, latitude].
  location?: { type: "Point"; coordinates: [number, number] } | null;
  googlePlaceId?: string | null;
  website?: string;
  phone?: string;
  // Who added it (with their name on its page).
  addedBy?: string | { _id: string; name?: string } | null;
  isArchived?: boolean;
  dishCount?: number;
  // Metres from where one is (a "near" search only).
  distance?: number | null;
  mine: RestaurantMine;
  createdAt?: string;
  updatedAt?: string;
}

// A change one suggested to a restaurant or dish, waiting for a reviewer.
export interface ChangeRequest {
  _id: string;
  kind: "restaurant" | "dish";
  item: string;
  restaurant?: string | null;
  action: "edit" | "remove";
  // { field: value as it'd be } and as it was.
  changes: Record<string, unknown>;
  before: Record<string, unknown>;
  note?: string;
  by?: { _id: string; name?: string } | string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote?: string;
  createdAt?: string;
}

// A restaurant's page: its menu, its last changes, one's suggestions still
// waiting, and whether one reviews.
export interface RestaurantDetail extends Restaurant {
  dishes: RestaurantDish[];
  history: HistoryEntry[];
  mySuggestions: ChangeRequest[];
  canReview: boolean;
}

// A change sent as a suggestion (one isn't a reviewer), not made.
export interface Suggested {
  pending: true;
  request: ChangeRequest;
}
export const isSuggested = (result: unknown): result is Suggested => !!result && typeof result === "object" && (result as Suggested).pending === true && "request" in (result as object);

// A dish from the dish library (USDA's restaurant-style dishes): generic,
// not any restaurant's — picked to fill in a dish's nutrition, at a size.
export interface LibraryDish {
  _id: string;
  fdcId: number;
  name: string;
  category: string;
  aliases: string[];
  sourceName?: string | null;
  // Its measures: "cup" = 200 g, "piece, large pizza" = 119 g…
  units: { unit: string; grams: number }[];
  // A typical restaurant serving.
  serving: { amount: number; unit: string; grams: number };
  per100g: DishNutrition;
}

export interface RestaurantInput {
  name: string;
  cuisine?: string;
  address?: string;
  location?: { lat: number; lng: number } | null;
  googlePlaceId?: string | null;
  website?: string;
  phone?: string;
  // A chain location: the chain's name (found or made).
  chainName?: string;
}

export interface DishInput {
  name: string;
  section?: string;
  nutrition: DishNutrition;
  source: RestaurantDish["source"];
  fromLibrary?: RestaurantDish["fromLibrary"];
}

// Adding a restaurant that may already be in Orbit: the ones it may be.
export class DuplicateRestaurantError extends Error {
  duplicates: Restaurant[];
  constructor(message: string, duplicates: Restaurant[]) {
    super(message);
    this.duplicates = duplicates;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/restaurants${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string; duplicates?: Restaurant[]; pending?: boolean } | null;
  if (response.status === 409 && body?.duplicates) throw new DuplicateRestaurantError(body.message ?? "This restaurant may already be in Orbit.", body.duplicates);
  if (!response.ok) throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  if (!body) throw new Error("The server returned an empty response");
  // (A change sent as a suggestion: what was suggested, not the item.)
  if (response.status === 202 && body.pending) return { pending: true, request: body.data } as T;
  return body.data as T;
}
const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// --- Restaurants ---------------------------------------------------------

// One's own: saved, or any one's logged.
export const getMyRestaurants = () => call<Restaurant[]>("?mine=true");

// Every public restaurant by name (or chain), nearest first when `near` is given.
export function searchRestaurants(query: string, near?: { lat: number; lng: number } | null) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (near) params.set("near", `${near.lng},${near.lat}`);
  return call<Restaurant[]>(`?${params.toString()}`);
}

export const getRestaurant = (id: string) => call<RestaurantDetail>(`/${id}`);

// Throws DuplicateRestaurantError when it may already be in Orbit (unless `force`).
export const createRestaurant = (input: RestaurantInput, force = false) => call<Restaurant>(force ? "?force=true" : "", send("POST", input));

// A correction (wiki): kept in its history, with an optional `note`.
// A reviewer's change (or one's own still-waiting restaurant's) is made; anyone
// else's comes back as `Suggested` (isSuggested).
export const updateRestaurant = (id: string, changes: Partial<RestaurantInput> & { note?: string }) => call<Restaurant | Suggested>(`/${id}`, send("PATCH", changes));

// Out of one's own list (the admin can archive it outright: `archive`).
export const removeRestaurant = (id: string, archive = false) => call<unknown>(`/${id}${archive ? "?archive=true" : ""}`, send("DELETE"));

export const setRestaurantMine = (id: string, mine: Partial<RestaurantMine>) => call<RestaurantMine>(`/${id}/mine`, send("PUT", mine));

// The admin's: the same place added twice.
export const mergeRestaurant = (id: string, intoId: string) => call<{ mergedInto: string }>(`/${id}/merge-into/${intoId}`, send("POST"));

// --- Dishes ----------------------------------------------------------------

// On the restaurant's menu (its chain's, for a chain location).
export const addDish = (restaurantId: string, input: DishInput) => call<RestaurantDish>(`/${restaurantId}/dishes`, send("POST", input));

// Made, or `Suggested` (see updateRestaurant).
export const updateDish = (dishId: string, changes: Partial<DishInput> & { note?: string }) => call<RestaurantDish | Suggested>(`/dishes/${dishId}`, send("PATCH", changes));

// Off the menu (meals that had it keep their copy) — or `Suggested`.
export const removeDish = (dishId: string, note?: string) => call<unknown>(`/dishes/${dishId}${note ? `?note=${encodeURIComponent(note)}` : ""}`, send("DELETE"));

export const setDishMine = (dishId: string, mine: Partial<Omit<DishMine, "scores">>) => call<DishMine>(`/dishes/${dishId}/mine`, send("PUT", mine));

export const addDishScore = (dishId: string, value: number, ratedAt?: string, mealPlanEntry?: string) =>
  call<DishScore[]>(`/dishes/${dishId}/scores`, send("POST", { value, ratedAt, mealPlanEntry }));

export const deleteDishScore = (dishId: string, scoreId: string) => call<DishScore[]>(`/dishes/${dishId}/scores/${scoreId}`, send("DELETE"));

// --- Review (reviewers only) -------------------------------------------------

// What's waiting: new restaurants (with the dishes added with them), new
// dishes on restaurants already there, and suggested changes (with the item as
// it is now), oldest first.
export interface ReviewQueue {
  restaurants: (Omit<Restaurant, "addedBy"> & { addedBy?: { _id: string; name?: string } | null; chain?: { _id: string; name: string } | null; dishes: RestaurantDish[] })[];
  dishes: (Omit<RestaurantDish, "addedBy" | "mine"> & { addedBy?: { _id: string; name?: string } | null; restaurantName: string | null; restaurantId: string | null })[];
  requests: (Omit<ChangeRequest, "item"> & { item: Restaurant | RestaurantDish | null; restaurantName: string | null })[];
}
export const getReviewQueue = () => call<ReviewQueue>("/review");

export const review = (kind: "restaurants" | "dishes" | "requests", id: string, decision: "approve" | "reject", note?: string) =>
  call<{ status: ReviewStatus }>(`/review/${kind}/${id}`, send("POST", { decision, note }));

// --- The dish library ------------------------------------------------------

export const searchLibraryDishes = (query: string, limit = 30) =>
  query.trim().length < 2 ? Promise.resolve([] as LibraryDish[]) : call<LibraryDish[]>(`/library?q=${encodeURIComponent(query.trim())}&limit=${limit}`);

export const getLibraryDish = (id: string) => call<LibraryDish>(`/library/${id}`);

// A library dish's nutrition at a size: `amount` of one of its units (or "g").
export function libraryDishNutrition(dish: LibraryDish, amount: number, unit: string): { grams: number; nutrition: DishNutrition } | null {
  const grams = unit === "g" ? amount : amount * (dish.units.find((u) => u.unit === unit)?.grams ?? NaN);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const nutrition: DishNutrition = {};
  for (const [field, per100] of Object.entries(dish.per100g ?? {}) as [keyof DishNutrition, number | null | undefined][]) {
    if (per100 == null) continue;
    const value = (per100 * grams) / 100;
    const places = value >= 10 ? 10 : value >= 1 ? 100 : 1000;
    nutrition[field] = Math.round(value * places) / places;
  }
  return { grams, nutrition };
}

// --- An AI estimate from a photo (writes nothing) ---------------------------

export interface EstimatedDish {
  name: string;
  estimatedNutrition: DishNutrition;
  // A short caveat on what's uncertain — always present.
  portionNote: string;
  confidence: "high" | "medium" | "low";
}

// `singleDish`: the photo is of one dish (a dish's own scan), not a table.
export async function estimateDishesFromPhoto(photoUri: string, restaurantName?: string, singleDish?: boolean): Promise<EstimatedDish[]> {
  const imageBase64 = await new File(photoUri).base64();
  const data = await call<{ dishes: EstimatedDish[] }>("/estimate-photo", send("POST", { imageBase64, mediaType: "image/jpeg", restaurantName, singleDish }));
  return data.dishes;
}

// --- Where it is ------------------------------------------------------------

// "Open in Google Maps": by its place id when known, else its name and where it is.
export function mapsUrl(restaurant: Pick<Restaurant, "name" | "address" | "location" | "googlePlaceId">) {
  const [lng, lat] = restaurant.location?.coordinates ?? [];
  const query = lat != null && lng != null ? `${lat},${lng}` : [restaurant.name, restaurant.address].filter(Boolean).join(", ");
  const params = new URLSearchParams({ api: "1", query });
  if (restaurant.googlePlaceId) params.set("query_place_id", restaurant.googlePlaceId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
