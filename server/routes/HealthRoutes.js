import express from "express";

import HealthMetric from "../models/HealthMetric.js";
import { matchWatchWorkouts } from "../services/gymWatchMatch.js";

const router = express.Router();

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/health-data/metrics  { metrics: [{ type, key, date, value, unit, start, end, source, detail }] }
 * Readings in (from Apple Health, a sync at a time): each one's added, or —
 * already there by its key — brought up to date.
 */
router.post("/metrics", async (req, res) => {
  try {
    const incoming = (Array.isArray(req.body.metrics) ? req.body.metrics : [])
      .slice(0, 5000)
      .filter((m) => m && typeof m.type === "string" && typeof m.key === "string" && DAY.test(m.date) && Number.isFinite(Number(m.value)))
      .map((m) => ({
        type: m.type.slice(0, 40),
        key: m.key.slice(0, 120),
        date: m.date,
        value: Number(m.value),
        unit: String(m.unit ?? "").slice(0, 20),
        start: m.start ? new Date(m.start) : null,
        end: m.end ? new Date(m.end) : null,
        source: String(m.source ?? "apple").slice(0, 20),
        detail: m.detail && typeof m.detail === "object" ? m.detail : null,
      }));
    // (The last of any key sent twice.)
    const byKey = new Map(incoming.map((m) => [m.key, m]));
    const existing = await HealthMetric.find({ key: { $in: [...byKey.keys()] } }).select("_id key value detail").lean();
    const had = new Map(existing.map((e) => [e.key, e]));
    let updated = 0;
    for (const [key, m] of byKey) {
      const old = had.get(key);
      if (!old) continue;
      if (old.value !== m.value || JSON.stringify(old.detail ?? null) !== JSON.stringify(m.detail)) {
        await HealthMetric.updateOne({ _id: old._id }, { $set: m });
        updated++;
      }
    }
    const fresh = [...byKey.values()].filter((m) => !had.has(m.key));
    if (fresh.length) await HealthMetric.create(fresh);
    // (A run or a game of badminton on the Watch ticks off its training time.)
    await matchWatchWorkouts([...byKey.values()]).catch((error) => console.error("Watch workouts:", error.message));
    return res.json({ success: true, data: { added: fresh.length, updated, unchanged: existing.length - updated } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/health-data/metrics?types=steps,sleep&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Your readings, the latest day first.
 */
router.get("/metrics", async (req, res) => {
  try {
    const filter = {};
    const types = String(req.query.types ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length) filter.type = { $in: types };
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    if (DAY.test(from) || DAY.test(to)) filter.date = { ...(DAY.test(from) ? { $gte: from } : {}), ...(DAY.test(to) ? { $lte: to } : {}) };
    const metrics = await HealthMetric.find(filter).sort({ date: -1, type: 1 }).limit(5000).select("-owner -__v -createdAt").lean();
    return res.json({ success: true, data: metrics });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/** DELETE /api/health-data/metrics/:id — one reading. */
router.delete("/metrics/:id", async (req, res) => {
  try {
    const result = await HealthMetric.deleteOne({ _id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
