import mongoose from "mongoose";

import AccessCode from "../models/AccessCode.js";
import Session from "../models/Session.js";
import User from "../models/User.js";

// Deleting an account and everything that's theirs: every record they own
// (their pantry, plans, lists, calendar, receipts, photos, devices, their
// own catalog additions and their side of the shared catalog — any model
// with an `owner`), their sessions and codes, and the account. Nothing of
// anyone else's, and nothing in the shared catalog, is touched. It can't be
// undone.
export async function deleteAccount(userId) {
  const id = new mongoose.Types.ObjectId(String(userId));
  const removed = {};
  // (Straight to the collections: past the per-request owner filters,
  // which would otherwise limit this to whoever is asking.)
  for (const model of Object.values(mongoose.models)) {
    if (!model.schema.path("owner")) continue;
    const { deletedCount } = await model.collection.deleteMany({ owner: id });
    if (deletedCount) removed[model.collection.collectionName] = deletedCount;
  }
  await Session.collection.deleteMany({ user: id });
  await AccessCode.collection.deleteMany({ $or: [{ user: id }, { createdBy: id, usedAt: null }] });
  await User.collection.deleteOne({ _id: id });
  return removed;
}
