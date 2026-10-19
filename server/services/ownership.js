import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";

import User from "../models/User.js";

// Whose things a request is about.
//
// Personal records (the pantry, the meal plan, tasks, weight…) carry an
// `owner` — the account they belong to (later this can be a household, for
// things a household shares). Rather than every route remembering to say
// "only mine", the `ownedByUser` plugin below adds it to every query on
// those models, and stamps it on everything created: a request runs inside
// `ownerScope`, which records whose request it is for everything it does,
// including work it carries on with in the background (a receipt being
// read). Outside a request (scripts, the test-data reset) there's no owner
// and nothing is filtered.
//
// Until the app signs in (and while the server doesn't require it — see
// signInRequired), a request without an account is taken to be the admin's,
// since everything so far is theirs. The admin also sees records that don't
// have an owner yet (from before accounts), so nothing goes missing between
// this server going live and the existing records being given their owner
// (manual_controls/scripts/assign_owners.js).

const context = new AsyncLocalStorage();

// { owner, legacy } for the request being handled, or undefined.
export const currentScope = () => context.getStore();

// Whether a request needs an account. On the deployed server (Render sets
// RENDER) it does unless REQUIRE_SIGN_IN=false says otherwise — so a
// forgotten or mistyped setting can't leave it open; on a developer's
// machine it doesn't unless REQUIRE_SIGN_IN=true.
export function signInRequired() {
  const setting = String(process.env.REQUIRE_SIGN_IN ?? "").trim().toLowerCase();
  if (setting === "false") return false;
  return setting === "true" || !!process.env.RENDER || process.env.NODE_ENV === "production";
}

// (The admin, looked up at most once a minute.)
let admin = { id: null, at: 0 };
export async function adminId() {
  if (Date.now() - admin.at > 60_000) {
    const found = await User.findOne({ role: "admin" }).sort({ createdAt: 1 }).select("_id").lean();
    admin = { id: found?._id ?? null, at: Date.now() };
  }
  return admin.id;
}

// Paths anyone can call without an account, once sign-in is required:
// signing in itself, the health check, and photos (opened by their link).
const OPEN = [/^\/api\/health$/, /^\/api\/auth\/(signin|signup|reset)$/, /^\/api\/photos\/[^/]+(\/[^/]+)?$/];

// Express middleware (after `authenticate`): runs the rest of the request
// as its owner's.
export async function ownerScope(req, res, next) {
  try {
    let owner = req.user?._id ?? null;
    // (A session that's ended, or a token from elsewhere — the other
    // database on a developer's machine — isn't "no account": it's turned
    // away, so the app asks to sign in again.)
    if (!owner && req.authProblem && !OPEN.some((path) => path.test(req.path))) return res.status(401).json({ success: false, message: req.authProblem });
    if (!owner) {
      if (signInRequired()) {
        if (!OPEN.some((path) => path.test(req.path))) return res.status(401).json({ success: false, message: req.authProblem ?? "Sign in first." });
      } else {
        owner = await adminId();
      }
    }
    const legacy = !owner || String(owner) === String(await adminId());
    context.run({ owner, legacy }, next);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// The condition on `owner` for the current scope: the owner's own records,
// and (for the admin) those from before accounts.
function ownerCondition(scope) {
  return scope.legacy ? { $in: [scope.owner, null] } : scope.owner;
}

const QUERIES = ["find", "findOne", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany", "countDocuments", "distinct"];

// No update may move a record to someone else — not even by renaming
// another field to "owner".
export function refuseOwnerRename(update) {
  for (const target of Object.values(update?.$rename ?? {})) {
    if (String(target).split(".")[0] === "owner") throw new Error("A record can't be moved to someone else.");
  }
}

// (An update from a request never moves a record to someone else.)
function withoutOwner(update) {
  if (!update || Array.isArray(update)) return update;
  refuseOwnerRename(update);
  const rest = { ...update };
  delete rest.owner;
  for (const op of ["$set", "$setOnInsert", "$unset", "$rename"]) {
    if (rest[op] && "owner" in rest[op]) {
      rest[op] = { ...rest[op] };
      delete rest[op].owner;
    }
  }
  return rest;
}

// The plugin for a personal model: an `owner`, set on create, and every
// query limited to the current owner's. Within a request the owner is
// always the server's to set — whatever a request body says — so no one can
// read, change or create records in someone else's account. (Scripts run
// outside a request, so they're unaffected.)
export function ownedByUser(schema) {
  schema.add({ owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null } });
  schema.index({ owner: 1 });

  schema.pre(QUERIES, { document: false, query: true }, function () {
    const scope = currentScope();
    // (`anyOwner`: a query that deliberately looks past the current owner —
    // the admin's settings that everyone shares, like unit conversions.)
    if (!scope || this.getOptions().anyOwner) return;
    this.where({ owner: ownerCondition(scope) });
    const update = this.getUpdate();
    if (update) {
      const cleaned = withoutOwner(update);
      // (An upsert creates the record as the owner's.)
      this.setUpdate(this.getOptions().upsert ? { ...cleaned, $setOnInsert: { ...(cleaned.$setOnInsert ?? {}), owner: scope.owner } } : cleaned);
    }
  });

  schema.pre("save", function () {
    const scope = currentScope();
    // (New, from before accounts, or tampered with: it's the owner's.)
    if (scope && (this.isNew || this.owner == null || this.isModified("owner"))) this.owner = scope.owner;
  });

  schema.pre("insertMany", function (docs) {
    const scope = currentScope();
    if (!scope) return;
    for (const doc of Array.isArray(docs) ? docs : [docs]) if (doc) doc.owner = scope.owner;
  });

  schema.pre("aggregate", function () {
    const scope = currentScope();
    if (!scope) return;
    this.pipeline().unshift({ $match: { owner: ownerCondition(scope) } });
  });

  schema.pre("bulkWrite", function (ops) {
    const scope = currentScope();
    if (!scope) return;
    for (const op of ops) {
      const [kind, body] = Object.entries(op)[0] ?? [];
      if (!body) continue;
      if (kind === "insertOne") {
        if (body.document) body.document.owner = scope.owner;
        continue;
      }
      body.filter = { ...(body.filter ?? {}), owner: ownerCondition(scope) };
      if (body.update) body.update = withoutOwner(body.update);
      if (body.replacement) body.replacement = { ...body.replacement, owner: scope.owner };
    }
  });
}
