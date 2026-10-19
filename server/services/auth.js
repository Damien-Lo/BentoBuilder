import crypto from "node:crypto";
import { promisify } from "node:util";

import Session from "../models/Session.js";
import User from "../models/User.js";

// Signing in: passwords, sessions, and who a request is from.
//
// Passwords are hashed with scrypt (Node's own; nothing to install), kept as
// "scrypt$N$r$p$salt$hash". A session token is 32 random bytes, handed to
// the device once; the server keeps only its SHA-256. A session lasts
// SESSION_DAYS from when it was last used.

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;
// (A session's last use is saved at most this often.)
const TOUCH_EVERY = 10 * 60 * 1000;

export const MIN_PASSWORD = 8;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  // (No password is longer than this: a huge one isn't worth hashing.)
  if (typeof password !== "string" || password.length > 200) return false;
  const [kind, N, r, p, salt, hash] = String(stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(String(password), Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}

// (Checked against when there's no such account, so a wrong email takes as
// long to answer as a wrong password.)
const DECOY = hashPassword(crypto.randomBytes(16).toString("hex"));
export const verifyDecoy = async (password) => verifyPassword(password, await DECOY);

// What's wrong with a new password, if anything.
export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return "That password is too long.";
  return null;
}

export const normalEmail = (email) => (typeof email === "string" ? email.slice(0, 300).trim().toLowerCase() : "");
export const isEmail = (email) => typeof email === "string" && email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

// A code for a person to type (an invite, a password reset): ten letters
// and digits, none that look alike, shown as XXXXX-XXXXX.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode() {
  const bytes = crypto.randomBytes(10);
  const letters = [...bytes].map((b) => CODE_LETTERS[b % CODE_LETTERS.length]).join("");
  return `${letters.slice(0, 5)}-${letters.slice(5)}`;
}
// (Typed codes: case, spaces and dashes don't matter.)
export const codeHash = (code) => sha256(String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""));

// A new session for `user` on a device; returns the token, which the device
// keeps (it isn't stored here).
export async function startSession(user, deviceName = "") {
  const token = crypto.randomBytes(32).toString("base64url");
  const session = await Session.create({
    user: user._id,
    tokenHash: sha256(token),
    deviceName: String(deviceName ?? "").trim().slice(0, 80),
    expiresAt: new Date(Date.now() + SESSION_DAYS * DAY),
  });
  await User.updateOne({ _id: user._id }, { lastSignInAt: new Date() });
  return { token, session };
}

const bearer = (req) => {
  const header = req.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

// Who a request is from, by its session token: sets req.user and
// req.session when the token is good. Doesn't turn anyone away — that's
// requireUser — so routes that don't need an account yet still work.
export async function authenticate(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) return next();
    const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
    if (!session) {
      req.authProblem = "Your session has ended. Sign in again.";
      return next();
    }
    const user = await User.findById(session.user);
    if (!user) {
      req.authProblem = "That account no longer exists.";
      return next();
    }
    if (user.disabledAt) {
      req.authProblem = BLOCKED;
      return next();
    }
    if (Date.now() - session.lastUsedAt.getTime() > TOUCH_EVERY) {
      session.lastUsedAt = new Date();
      session.expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
      await session.save();
    }
    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    console.error("authenticate:", error);
    res.status(500).json({ success: false, message: "Something went wrong on the server." });
  }
}

export const BLOCKED = "This account has been turned off. Ask whoever runs your BentoBuilder.";

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: req.authProblem ?? "Sign in first." });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: req.authProblem ?? "Sign in first." });
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Only the admin can do that." });
  next();
}

// The developer tools (switching databases, data fixes) are the admin's.
// (A request without an account is the admin's until sign-in is required —
// see services/ownership.js.)
export function adminOrNoAccount(req, res, next) {
  if (req.user && req.user.role !== "admin") return res.status(403).json({ success: false, message: "Only the admin can do that." });
  next();
}

// Slowing down guessing: after LIMIT failures for the same key within
// WINDOW, further tries are refused until the window has passed. The keys:
// the network address; the email from that address (so one person's typos
// don't lock anyone else out); and the email from anywhere, with a higher
// limit (a guesser spread over many addresses is still slowed, and can't
// lock an account out with a handful of tries). Kept in memory: a restart
// forgets it, which is fine for this purpose.
const LIMIT = { perAddress: 20, perEmailHere: 5, perEmail: 50 };
const WINDOW = 15 * 60 * 1000;
const failures = new Map();

function failuresFor(key) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.since > WINDOW) return null;
  return entry;
}

// Minutes to wait before trying again, or 0.
export function waitMinutes(keys) {
  for (const [key, limit] of keys) {
    const entry = failuresFor(key);
    if (entry && entry.count >= limit) return Math.max(1, Math.ceil((entry.since + WINDOW - Date.now()) / 60000));
  }
  return 0;
}

export function noteFailure(keys) {
  for (const [key] of keys) {
    const entry = failuresFor(key) ?? { count: 0, since: Date.now() };
    entry.count += 1;
    failures.set(key, entry);
  }
  // (Old entries don't pile up.)
  if (failures.size > 5000) for (const [key, entry] of failures) if (Date.now() - entry.since > WINDOW) failures.delete(key);
}

export const clearFailures = (keys) => keys.forEach(([key]) => failures.delete(key));

// The limiter keys for a request: its address, and the email if there is
// one. (Only a real-looking email is kept: anything else — a huge string
// sent to fill the server's memory — counts against the address alone.)
export const attemptKeys = (req, email) => [
  [`ip:${req.ip}`, LIMIT.perAddress],
  ...(email && isEmail(email) ? [[`email:${email}|ip:${req.ip}`, LIMIT.perEmailHere], [`email:${email}`, LIMIT.perEmail]] : []),
];
