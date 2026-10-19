import express from "express";

import AccessCode from "../models/AccessCode.js";
import Session from "../models/Session.js";
import User from "../models/User.js";
import { deleteAccount } from "../services/accounts.js";
import {
  attemptKeys,
  BLOCKED,
  clearFailures,
  codeHash,
  hashPassword,
  isEmail,
  newCode,
  normalEmail,
  noteFailure,
  passwordProblem,
  requireAdmin,
  requireUser,
  startSession,
  verifyDecoy,
  verifyPassword,
  waitMinutes,
} from "../services/auth.js";

// Accounts: signing in and out, joining with an invite, passwords, and the
// devices signed in. The admin also makes invites and password-reset codes
// (no email is sent; the admin passes the code on). See services/auth.js.
//
// Answers with { token, user } wherever a session starts: the device keeps
// the token and sends it as "Authorization: Bearer <token>".
const router = express.Router();

const INVITE_DAYS = 7;
const RESET_HOURS = 24;

const shownUser = (user) => ({ _id: user._id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt, lastSignInAt: user.lastSignInAt, disabledAt: user.disabledAt ?? null });
const shownSession = (session, current) => ({ _id: session._id, deviceName: session.deviceName, createdAt: session.createdAt, lastUsedAt: session.lastUsedAt, current: String(session._id) === String(current?._id) });
const shownCode = (code) => ({ _id: code._id, kind: code.kind, email: code.email, user: code.user, note: code.note, expiresAt: code.expiresAt, usedAt: code.usedAt, createdAt: code.createdAt });

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const tooMany = (res, minutes) => fail(res, 429, `Too many tries. Wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`);

// A one-time code of `kind` that's still good.
async function openCode(kind, code) {
  return AccessCode.findOne({ kind, codeHash: codeHash(code), usedAt: null, expiresAt: { $gt: new Date() } });
}

/**
 * POST /api/auth/signin  { email, password, deviceName? }
 */
router.post("/signin", async (req, res) => {
  try {
    const email = normalEmail(req.body.email);
    const keys = attemptKeys(req, email);
    const wait = waitMinutes(keys);
    if (wait) return tooMany(res, wait);
    const user = isEmail(email) ? await User.findOne({ email }).select("+passwordHash") : null;
    const ok = user ? await verifyPassword(req.body.password ?? "", user.passwordHash) : await verifyDecoy(req.body.password ?? "");
    if (!user || !ok) {
      noteFailure(keys);
      return fail(res, 401, "That email and password don't match an account.");
    }
    clearFailures(keys);
    if (user.disabledAt) return fail(res, 403, BLOCKED);
    const { token } = await startSession(user, req.body.deviceName);
    return res.json({ success: true, data: { token, user: shownUser(user) } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * POST /api/auth/signup  { code, email, name, password, deviceName? }
 * Joining with an invite code.
 */
router.post("/signup", async (req, res) => {
  try {
    const keys = attemptKeys(req);
    const wait = waitMinutes(keys);
    if (wait) return tooMany(res, wait);
    const invite = await openCode("invite", req.body.code);
    if (!invite) {
      noteFailure(keys);
      return fail(res, 400, "That invite code isn't valid, or has been used or expired.");
    }
    const email = normalEmail(req.body.email);
    if (!isEmail(email)) return fail(res, 400, "Enter a valid email address.");
    if (invite.email && invite.email !== email) return fail(res, 400, "This invite is for a different email address.");
    const problem = passwordProblem(req.body.password);
    if (problem) return fail(res, 400, problem);
    if (await User.exists({ email })) {
      // (Counted, so an invite code can't be used to test emails endlessly.)
      noteFailure(keys);
      return fail(res, 409, "There's already an account with that email. Sign in instead.");
    }

    const user = await User.create({ email, name: String(req.body.name ?? "").trim().slice(0, 80), passwordHash: await hashPassword(req.body.password), role: "member" });
    // (Used up — and only once, even if two tries race.)
    const claimed = await AccessCode.updateOne({ _id: invite._id, usedAt: null }, { usedAt: new Date(), usedBy: user._id });
    if (!claimed.modifiedCount) {
      await User.deleteOne({ _id: user._id });
      return fail(res, 400, "That invite code has just been used.");
    }
    clearFailures(keys);
    const { token } = await startSession(user, req.body.deviceName);
    return res.status(201).json({ success: true, data: { token, user: shownUser(user) } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * POST /api/auth/reset  { code, email, password, deviceName? }
 * A new password with a reset code from the admin. Signs out everywhere
 * else, and in here.
 */
router.post("/reset", async (req, res) => {
  try {
    const email = normalEmail(req.body.email);
    const keys = attemptKeys(req, email);
    const wait = waitMinutes(keys);
    if (wait) return tooMany(res, wait);
    const reset = await openCode("reset", req.body.code);
    const user = reset && (await User.findOne({ _id: reset.user, email }));
    if (!user) {
      noteFailure(keys);
      return fail(res, 400, "That reset code isn't valid for this email, or has been used or expired.");
    }
    const problem = passwordProblem(req.body.password);
    if (problem) return fail(res, 400, problem);
    if (user.disabledAt) return fail(res, 403, BLOCKED);
    const claimed = await AccessCode.updateOne({ _id: reset._id, usedAt: null }, { usedAt: new Date(), usedBy: user._id });
    if (!claimed.modifiedCount) return fail(res, 400, "That reset code has just been used.");
    await User.updateOne({ _id: user._id }, { passwordHash: await hashPassword(req.body.password) });
    await Session.deleteMany({ user: user._id });
    clearFailures(keys);
    const { token } = await startSession(user, req.body.deviceName);
    return res.json({ success: true, data: { token, user: shownUser(user) } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// --- Signed in ------------------------------------------------------------

/**
 * GET /api/auth/me — the account and this session.
 */
router.get("/me", requireUser, (req, res) => res.json({ success: true, data: { user: shownUser(req.user), session: shownSession(req.session, req.session) } }));

/**
 * PATCH /api/auth/me  { name?, email?, currentPassword? }
 * Changing the email needs the current password.
 */
router.patch("/me", requireUser, async (req, res) => {
  try {
    const updates = {};
    if (typeof req.body.name === "string") updates.name = req.body.name.trim().slice(0, 80);
    if (req.body.email !== undefined) {
      const email = normalEmail(req.body.email);
      if (email !== req.user.email) {
        if (!isEmail(email)) return fail(res, 400, "Enter a valid email address.");
        const keys = attemptKeys(req, req.user.email);
        const wait = waitMinutes(keys);
        if (wait) return tooMany(res, wait);
        const me = await User.findById(req.user._id).select("+passwordHash");
        if (!(await verifyPassword(req.body.currentPassword ?? "", me.passwordHash))) {
          noteFailure(keys);
          return fail(res, 400, "Your current password isn't right.");
        }
        if (await User.exists({ email })) return fail(res, 409, "There's already an account with that email.");
        updates.email = email;
      }
    }
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    return res.json({ success: true, data: shownUser(user) });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * POST /api/auth/password  { currentPassword, newPassword }
 * Signs out every other device.
 */
router.post("/password", requireUser, async (req, res) => {
  try {
    const keys = attemptKeys(req, req.user.email);
    const wait = waitMinutes(keys);
    if (wait) return tooMany(res, wait);
    const me = await User.findById(req.user._id).select("+passwordHash");
    if (!(await verifyPassword(req.body.currentPassword ?? "", me.passwordHash))) {
      noteFailure(keys);
      return fail(res, 400, "Your current password isn't right.");
    }
    const problem = passwordProblem(req.body.newPassword);
    if (problem) return fail(res, 400, problem);
    await User.updateOne({ _id: me._id }, { passwordHash: await hashPassword(req.body.newPassword) });
    const ended = await Session.deleteMany({ user: me._id, _id: { $ne: req.session._id } });
    clearFailures(keys);
    return res.json({ success: true, data: { signedOut: ended.deletedCount } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * POST /api/auth/signout — ends this session.
 */
router.post("/signout", requireUser, async (req, res) => {
  await Session.deleteOne({ _id: req.session._id });
  return res.json({ success: true });
});

/**
 * GET /api/auth/sessions — the devices signed in to this account.
 */
router.get("/sessions", requireUser, async (req, res) => {
  const sessions = await Session.find({ user: req.user._id, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 });
  return res.json({ success: true, data: sessions.map((s) => shownSession(s, req.session)) });
});

/**
 * DELETE /api/auth/sessions/:id — signs that device out.
 * DELETE /api/auth/sessions — signs out every device but this one.
 */
router.delete("/sessions/:id", requireUser, async (req, res) => {
  try {
    const ended = await Session.deleteOne({ _id: req.params.id, user: req.user._id });
    if (!ended.deletedCount) return fail(res, 404, "That session isn't there.");
    return res.json({ success: true });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});
router.delete("/sessions", requireUser, async (req, res) => {
  const ended = await Session.deleteMany({ user: req.user._id, _id: { $ne: req.session._id } });
  return res.json({ success: true, data: { signedOut: ended.deletedCount } });
});

// --- The admin ------------------------------------------------------------

/**
 * GET /api/auth/users — everyone with an account.
 */
router.get("/users", requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  return res.json({ success: true, data: users.map(shownUser) });
});

/**
 * POST /api/auth/invites  { email?, note? } — a new invite code, shown
 * once. With an email, only that address can use it.
 */
router.post("/invites", requireAdmin, async (req, res) => {
  try {
    const email = normalEmail(req.body.email);
    if (email && !isEmail(email)) return fail(res, 400, "Enter a valid email address, or leave it empty.");
    if (email && (await User.exists({ email }))) return fail(res, 409, "There's already an account with that email.");
    const code = newCode();
    const invite = await AccessCode.create({
      kind: "invite",
      codeHash: codeHash(code),
      email,
      note: String(req.body.note ?? "").trim().slice(0, 80),
      createdBy: req.user._id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    });
    return res.status(201).json({ success: true, data: { ...shownCode(invite), code } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * GET /api/auth/invites — invites not yet used (and still good).
 */
router.get("/invites", requireAdmin, async (req, res) => {
  const invites = await AccessCode.find({ kind: "invite", usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  return res.json({ success: true, data: invites.map(shownCode) });
});

/**
 * GET /api/auth/invite-links — the links put in invite messages.
 * PUT /api/auth/invite-links  { web?, register?, install? }
 */
const asLink = (value) => {
  const text = String(value ?? "").trim().slice(0, 500);
  return !text || /^https:\/\/\S+$/.test(text) ? text : null;
};
router.get("/invite-links", requireAdmin, (req, res) => {
  const links = req.user.inviteLinks ?? {};
  return res.json({ success: true, data: { web: links.web ?? "", register: links.register ?? "", install: links.install ?? "" } });
});
router.put("/invite-links", requireAdmin, async (req, res) => {
  const web = asLink(req.body.web);
  const register = asLink(req.body.register);
  const install = asLink(req.body.install);
  if (web === null || register === null || install === null) return fail(res, 400, "Links start with https://.");
  await User.updateOne({ _id: req.user._id }, { inviteLinks: { web, register, install } });
  return res.json({ success: true, data: { web, register, install } });
});

/**
 * DELETE /api/auth/invites/:id — withdraws an unused invite.
 */
router.delete("/invites/:id", requireAdmin, async (req, res) => {
  try {
    const gone = await AccessCode.deleteOne({ _id: req.params.id, kind: "invite", usedAt: null });
    if (!gone.deletedCount) return fail(res, 404, "That invite isn't there, or has been used.");
    return res.json({ success: true });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * POST /api/auth/users/:id/reset-code — a code that person can use to set a
 * new password (for a forgotten one). Shown once; replaces any earlier one.
 */
router.post("/users/:id/reset-code", requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 404, "No such account.");
    await AccessCode.deleteMany({ kind: "reset", user: user._id, usedAt: null });
    const code = newCode();
    const reset = await AccessCode.create({
      kind: "reset",
      codeHash: codeHash(code),
      email: user.email,
      user: user._id,
      createdBy: req.user._id,
      expiresAt: new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000),
    });
    return res.status(201).json({ success: true, data: { ...shownCode(reset), code } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * DELETE /api/auth/me  { password }
 * Deletes this account and everything that's theirs (services/accounts.js).
 * Not the admin's: the admin looks after everyone else's accounts.
 */
router.delete("/me", requireUser, async (req, res) => {
  try {
    if (req.user.role === "admin") return fail(res, 400, "The admin's account can't be deleted from the app.");
    const keys = attemptKeys(req, req.user.email);
    const wait = waitMinutes(keys);
    if (wait) return tooMany(res, wait);
    const me = await User.findById(req.user._id).select("+passwordHash");
    if (!(await verifyPassword(req.body?.password ?? "", me.passwordHash))) {
      noteFailure(keys);
      return fail(res, 400, "That password isn't right.");
    }
    const removed = await deleteAccount(me._id);
    return res.json({ success: true, data: { removed } });
  } catch (error) {
    console.error("Delete account:", error);
    return fail(res, 500, "The account couldn't be deleted. Try again.");
  }
});

// (Someone else's account, for the admin.)
async function otherAccount(req, res) {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) {
    fail(res, 404, "No such account.");
    return null;
  }
  if (String(user._id) === String(req.user._id)) {
    fail(res, 400, "That's your own account.");
    return null;
  }
  return user;
}

/**
 * POST /api/auth/users/:id/disable — turns an account off: signed out
 * everywhere, and can't sign in until turned back on.
 * POST /api/auth/users/:id/enable — turns it back on.
 */
router.post("/users/:id/disable", requireAdmin, async (req, res) => {
  const user = await otherAccount(req, res);
  if (!user) return;
  user.disabledAt = new Date();
  await user.save();
  await Session.deleteMany({ user: user._id });
  return res.json({ success: true, data: shownUser(user) });
});
router.post("/users/:id/enable", requireAdmin, async (req, res) => {
  const user = await otherAccount(req, res);
  if (!user) return;
  user.disabledAt = null;
  await user.save();
  return res.json({ success: true, data: shownUser(user) });
});

/**
 * DELETE /api/auth/users/:id — removes someone's account and everything
 * that's theirs.
 */
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const user = await otherAccount(req, res);
    if (!user) return;
    const removed = await deleteAccount(user._id);
    return res.json({ success: true, data: { removed } });
  } catch (error) {
    console.error("Remove account:", error);
    return fail(res, 500, "The account couldn't be removed. Try again.");
  }
});

export default router;
