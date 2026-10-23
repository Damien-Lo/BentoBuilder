import express from "express";
import WeightEntry from "../models/WeightEntry.js";

const router = express.Router();

/**
 * GET /api/weight-entries
 * All entries (not the hidden ones), most recent date first.
 */
router.get("/", async (req, res) => {
  try {
    const entries = await WeightEntry.find({ hidden: { $ne: true } }).sort({ date: -1 });
    return res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (error) {
    console.error("Get weight entries error:", error);
    return res.status(500).json({ success: false, message: "Failed to load weight entries" });
  }
});

/**
 * POST /api/weight-entries
 * Body: { weight, date }
 * Upserts by date — logging again on a date that already has an entry
 * updates it instead of creating a duplicate.
 */
router.post("/", async (req, res) => {
  try {
    const { weight, date } = req.body;
    if (weight == null || !date) {
      return res.status(400).json({ success: false, message: "weight and date are required" });
    }

    // (Logged by hand: yours — shown again if it was hidden.)
    const entry = await WeightEntry.findOneAndUpdate(
      { date },
      { $set: { weight, source: "manual", hidden: false } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return res.status(200).json({ success: true, data: entry });
  } catch (error) {
    console.error("Create weight entry error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/weight-entries/sync  { entries: [{ date, weight }] }
 * Apple Health's weights, a day each. The first time any arrive, the
 * entries from before Apple Health are retired — hidden (kept), or, on a
 * day Apple Health has, replaced (the old weight kept beside it). Then each
 * day's weight is Apple Health's — except a day you've logged or edited
 * yourself, or a synced one you've deleted.
 */
router.post("/sync", async (req, res) => {
  try {
    const incoming = new Map(
      (Array.isArray(req.body.entries) ? req.body.entries : [])
        .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isFinite(Number(e.weight)) && Number(e.weight) > 0)
        .map((e) => [e.date, Math.round(Number(e.weight) * 100) / 100]),
    );
    if (!incoming.size) return res.json({ success: true, data: { added: 0, updated: 0, retired: 0 } });
    let retired = 0;
    let added = 0;
    let updated = 0;
    // The ones from before Apple Health, retired.
    const old = await WeightEntry.find({ source: null, hidden: { $ne: true } });
    for (const entry of old) {
      if (incoming.has(entry.date)) {
        entry.previousWeight = entry.weight;
        entry.weight = incoming.get(entry.date);
        entry.source = "apple";
        updated++;
      } else {
        entry.hidden = true;
        retired++;
      }
      await entry.save();
    }
    const handled = new Set(old.filter((e) => incoming.has(e.date)).map((e) => e.date));
    const existing = new Map((await WeightEntry.find({ date: { $in: [...incoming.keys()] } })).map((e) => [e.date, e]));
    for (const [date, weight] of incoming) {
      if (handled.has(date)) continue;
      const entry = existing.get(date);
      if (!entry) {
        await WeightEntry.create({ date, weight, source: "apple" });
        added++;
      } else if (entry.source === "apple" && !entry.hidden && entry.weight !== weight) {
        entry.weight = weight;
        await entry.save();
        updated++;
      } else if (entry.source === null && entry.hidden) {
        // (One from before, hidden earlier: Apple Health's now.)
        entry.previousWeight = entry.weight;
        entry.weight = weight;
        entry.source = "apple";
        entry.hidden = false;
        await entry.save();
        updated++;
      }
    }
    return res.json({ success: true, data: { added, updated, retired } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/weight-entries/:id  { weight }
 * A weigh-in corrected — yours from then on (a sync leaves it alone).
 */
router.put("/:id", async (req, res) => {
  try {
    const weight = Number(req.body.weight);
    if (!Number.isFinite(weight) || weight <= 0) return res.status(400).json({ success: false, message: "A weight is needed" });
    const entry = await WeightEntry.findOneAndUpdate({ _id: req.params.id }, { $set: { weight, source: "manual", hidden: false } }, { new: true });
    if (!entry) return res.status(404).json({ success: false, message: "Weight entry not found" });
    return res.json({ success: true, data: entry });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/weight-entries/:id
 * Yours: gone. One synced from Apple Health: hidden, so the next sync
 * doesn't bring it back.
 */
router.delete("/:id", async (req, res) => {
  try {
    const found = await WeightEntry.findOne({ _id: req.params.id });
    if (!found) {
      return res.status(404).json({ success: false, message: "Weight entry not found" });
    }
    if (found.source === "apple") await WeightEntry.updateOne({ _id: found._id }, { $set: { hidden: true } });
    else await WeightEntry.deleteOne({ _id: found._id });
    return res.status(200).json({ success: true, message: "Weight entry deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid weight entry ID" });
  }
});

export default router;
