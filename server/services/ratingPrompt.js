import mongoose from "mongoose";

// When the planner may auto-ask "How was it?" for a recipe/ingredient —
// the app decides from this plus the item's scores (see the mobile
// src/utils/ratingPrompt.ts). `skipCount` counts skips in a row and resets
// on the next real rating; `disabled` is the "don't ask about this" choice.
export const ratingPromptSchema = new mongoose.Schema(
  {
    skipCount: { type: Number, min: 0, default: 0 },
    lastSkippedAt: { type: Date, default: null },
    disabled: { type: Boolean, default: false },
  },
  { _id: false },
);

// POST /:id/rating-prompt  { action: "skip" | "disable" | "enable" } — shared
// by the recipe and ingredient routers. Returns the item's ratingPrompt.
export function ratingPromptHandler(Model, label) {
  return async (req, res) => {
    const { action } = req.body ?? {};
    const update =
      action === "skip"
        ? { $inc: { "ratingPrompt.skipCount": 1 }, $set: { "ratingPrompt.lastSkippedAt": new Date() } }
        : action === "disable"
          ? { $set: { "ratingPrompt.disabled": true } }
          : action === "enable"
            ? { $set: { "ratingPrompt.disabled": false, "ratingPrompt.skipCount": 0 } }
            : null;
    if (!update) {
      return res.status(400).json({ success: false, message: 'action must be "skip", "disable" or "enable"' });
    }
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, update, { new: true }).select("ratingPrompt");
      if (!item) return res.status(404).json({ success: false, message: `${label} not found` });
      return res.status(200).json({ success: true, data: item.ratingPrompt });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };
}
