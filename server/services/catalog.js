import mongoose from "mongoose";

import FoodSettings from "../models/FoodSettings.js";
import StorageLocation from "../models/StorageLocation.js";
import { currentScope } from "./ownership.js";

// The food catalog — ingredients, recipes, brands, stores, tags and their
// categories — shared by everyone, plus what each person adds for
// themselves.
//
// A catalog record with no `owner` is shared; one with an owner is that
// person's own, seen by no one else. Everyone sees the shared ones and their
// own. The admin's additions are shared, and the admin changes shared
// records as before; anyone else's additions are their own, and they can't
// change a shared record (they can make their own copy of it: copyForMe).
//
// Some of what's on an ingredient or a recipe is one person's, not a fact
// about the food: how they rated it, their notes, when it's low in their
// kitchen, where they keep it, whether a recipe is a keeper
// (PERSONAL_FIELDS). On shared records those fields stay as they were — the
// admin's — and for anyone else they're kept in FoodSettings and shown in
// their place: reading a shared ingredient shows that person's own, and
// changing one of those fields changes only theirs. Nothing in the routes
// has to know; it's all done here, in the queries.

export const PERSONAL_FIELDS = {
  ingredient: ["notes", "scores", "ratingPrompt", "lowStockThreshold", "isAlwaysAvailable", "cooksFromFrozen", "thawLeads", "defaultStorageLocation", "defaultExpiryDurationAmount", "defaultExpiryDurationUnit"],
  recipe: ["notes", "scores", "ratingPrompt", "isConfirmed"],
};

// Worked out by the server (a recipe's nutrition from its ingredients), so
// anyone's request may bring them up to date on a shared record.
const DERIVED = ["nutrition", "contentChangedAt", "updatedAt"];
const META = ["_id", "__v", "id", "owner", "createdAt", "updatedAt"];

// Someone signed in who isn't the admin (the admin's scope is "legacy": it
// also covers everything from before accounts).
const isMember = (scope) => !!scope && !scope.legacy;
const readCondition = (scope) => ({ $in: [null, scope.owner] });

export class CatalogError extends Error {}
const sharedRefusal = (fields) =>
  new CatalogError(`Only the admin can change shared items (${fields.join(", ")}). Make your own copy to change it.`);

// --- Updates: what's personal, and whether the rest changes anything ------

const top = (path) => path.split(".")[0];

// An update as operators ({ $set: … }), plain fields counting as $set.
function asOperators(update) {
  const ops = {};
  for (const [key, value] of Object.entries(update ?? {})) {
    if (key.startsWith("$")) ops[key] = { ...(ops[key] ?? {}), ...value };
    else ops.$set = { ...(ops.$set ?? {}), [key]: value };
  }
  return ops;
}

// [the personal part, the rest] of an update.
function split(update, personal) {
  const mine = {};
  const rest = {};
  for (const [op, fields] of Object.entries(asOperators(update))) {
    if (!fields || typeof fields !== "object") continue;
    for (const [path, value] of Object.entries(fields)) {
      const into = personal.includes(top(path)) ? mine : META.includes(top(path)) ? null : rest;
      if (into) into[op] = { ...(into[op] ?? {}), [path]: value };
    }
  }
  return [Object.keys(mine).length ? mine : null, rest];
}

// (Loosely the same value: an id or a populated record, a number or its
// text, empty or missing. Only used to tell whether a request would change
// a shared record; it's never changed either way.)
function normal(value) {
  if (value == null || value === "") return null;
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normal);
  if (typeof value === "object") {
    if (value._id && Object.keys(value).length > 1) return String(value._id);
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}
function same(next, current) {
  const a = normal(next);
  const b = normal(current);
  if (a === null || b === null) return a === b || (a === null && (b === false || b === 0 || (Array.isArray(b) && !b.length)));
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (typeof a === "object") return typeof b === "object" && Object.entries(a).every(([k, v]) => same(v, b[k]));
  if (typeof a === "number" && typeof b === "string") return a === Number(b);
  return a === b || String(a) === String(b);
}
const valueAt = (doc, path) => path.split(".").reduce((v, key) => (v == null ? v : v[key]), doc);

// The fields a non-personal update would actually change on these records.
function changes(rest, records) {
  const changed = new Set();
  for (const [op, fields] of Object.entries(rest)) {
    for (const [path, value] of Object.entries(fields)) {
      if (op === "$set" && records.every((record) => same(value, valueAt(record, path)))) continue;
      if (op === "$setOnInsert") continue;
      changed.add(top(path));
    }
  }
  return [...changed];
}

// --- Showing a person's own fields in place of the admin's ----------------

const defaultsFor = (kind) => new FoodSettings({ kind, item: new mongoose.Types.ObjectId() }).toObject();

// (Whether a query's projection includes a field.)
function selected(projection, path) {
  if (!projection || !Object.keys(projection).length) return true;
  const inclusive = Object.values(projection).some((v) => v === 1 || v === true);
  if (inclusive) return Object.keys(projection).some((key) => key === path || key.startsWith(`${path}.`));
  return projection[path] !== 0 && projection[path] !== false;
}

async function showOwn(query, result, kind, personal) {
  const scope = currentScope();
  if (!isMember(scope) || !personal.length || !result) return;
  const records = (Array.isArray(result) ? result : [result]).filter((r) => r && r.owner == null && r._id);
  if (!records.length) return;
  const fields = personal.filter((path) => selected(query.projection(), path));
  if (!fields.length) return;

  const settings = await FoodSettings.find({ kind, item: { $in: records.map((r) => r._id) } }).lean();
  const byItem = new Map(settings.map((s) => [String(s.item), s]));
  const defaults = defaultsFor(kind);

  // (If the query filled in the storage location, so is theirs.)
  let locations = null;
  if (fields.includes("defaultStorageLocation") && query._mongooseOptions?.populate?.defaultStorageLocation) {
    const ids = settings.map((s) => s.defaultStorageLocation).filter(Boolean);
    locations = new Map((ids.length ? await StorageLocation.find({ _id: { $in: ids } }) : []).map((l) => [String(l._id), l]));
  }

  for (const record of records) {
    const own = byItem.get(String(record._id)) ?? defaults;
    const hydrated = record instanceof mongoose.Document;
    for (const path of fields) {
      let value = own[path] ?? defaults[path];
      if (path === "defaultStorageLocation" && locations && value) {
        const location = locations.get(String(value));
        value = location ? (hydrated ? location : location.toObject()) : null;
      }
      if (hydrated) {
        record.set(path, value);
        record.unmarkModified(path);
      } else {
        record[path] = value;
      }
    }
  }
}

// --- The plugin ----------------------------------------------------------

const READS = ["find", "findOne", "countDocuments", "distinct"];
const WRITES = ["findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany"];

// For a catalog model. `kind` ("ingredient", "recipe") when it has personal
// fields.
export function sharedCatalog(schema, { kind = null } = {}) {
  const personal = PERSONAL_FIELDS[kind] ?? [];
  schema.add({ owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null } });
  schema.index({ owner: 1 });

  schema.pre(READS, { document: false, query: true }, function () {
    const scope = currentScope();
    if (!scope || this.getOptions().anyOwner) return;
    this.where({ owner: readCondition(scope) });
  });

  schema.pre(WRITES, { document: false, query: true }, async function () {
    const scope = currentScope();
    if (!scope || this.getOptions().anyOwner) return;
    const update = this.getUpdate();
    // (No one moves a record to someone else, or out of the shared catalog.)
    if (update && /replace/i.test(this.op)) {
      const replacement = { ...update };
      delete replacement.owner;
      this.setUpdate(replacement);
    } else if (update) {
      this.setUpdate(Object.fromEntries(Object.entries(asOperators(update)).map(([op, fields]) => [op, Object.fromEntries(Object.entries(fields).filter(([path]) => top(path) !== "owner"))])));
    }

    if (!isMember(scope)) {
      // The admin: the shared records and their own.
      this.where({ owner: readCondition(scope) });
      return;
    }
    // Anyone else: their own records as they like. A shared one isn't
    // deleted or changed — only their own side of it.
    if (!update || this.op.startsWith("delete") || this.op === "findOneAndDelete") {
      this.where({ owner: scope.owner });
      return;
    }
    const single = !this.op.endsWith("Many");
    const found = await this.model.find(this.getFilter(), null, { limit: single ? 1 : undefined }).lean();
    const shared = found.filter((record) => record.owner == null);
    if (!shared.length) {
      this.where({ owner: scope.owner });
      return;
    }
    const [mine, rest] = split(this.getUpdate(), personal);
    const changed = changes(rest, shared);
    if (changed.length) throw sharedRefusal(changed);
    if (mine) for (const record of shared) await FoodSettings.updateOne({ kind, item: record._id }, mine, { upsert: true, runValidators: true });
    if (found.length === shared.length) {
      // (Only shared records: nothing of theirs changes. The query still
      // finds them, so a route answers with the record — showing the
      // person's own side, below.)
      this.setUpdate({});
    } else {
      this.where({ owner: scope.owner });
    }
  });

  if (personal.length) {
    schema.post(["find", "findOne", "findOneAndUpdate"], async function (result) {
      await showOwn(this, result, kind, personal);
    });
  }

  schema.pre("save", async function () {
    const scope = currentScope();
    if (!scope) return;
    if (this.isNew) {
      // The admin adds to the shared catalog; anyone else, to their own.
      this.owner = isMember(scope) ? scope.owner : null;
      return;
    }
    if (this.isModified("owner")) throw new CatalogError("A record can't be moved to someone else.");
    if (!isMember(scope) || this.owner != null) return;
    // Someone else saving a shared record: their own side is theirs to
    // change; what the server works out may be brought up to date; nothing
    // else.
    const paths = [...new Set(this.modifiedPaths().map(top))];
    const others = paths.filter((p) => !personal.includes(p) && !DERIVED.includes(p) && !META.includes(p));
    if (others.length) throw sharedRefusal(others);
    const mine = paths.filter((p) => personal.includes(p));
    if (mine.length) {
      await FoodSettings.updateOne({ kind, item: this._id }, { $set: Object.fromEntries(mine.map((p) => [p, this.get(p)])) }, { upsert: true, runValidators: true });
      for (const p of mine) this.unmarkModified(p);
    }
  });
}

// A person's own copy of a catalog record (to change it as they like):
// everything about it, with their own side of it, as their record. The
// admin's copy is shared, like anything they add.
export async function copyForMe(Model, id) {
  const original = await Model.findById(id);
  if (!original) return null;
  const data = original.toObject({ depopulate: true });
  for (const key of META) delete data[key];
  data.name = `${data.name} (my copy)`;
  // (A barcode is one product's, once per person: the admin's copy is
  // shared, like the original.)
  if (!isMember(currentScope())) delete data.barcode;
  return Model.create(data);
}
