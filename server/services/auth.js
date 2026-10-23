import crypto from "node:crypto";
import fs from "node:fs";
import { promisify } from "node:util";

import AuthFailure from "../models/AuthFailure.js";
import Session from "../models/Session.js";
import User from "../models/User.js";

// Signing in: passwords, sessions, and who a request is from.
//
// Passwords are hashed with scrypt (Node's own; nothing to install), kept as
// "scrypt$N$r$p$salt$hash" — at OWASP's recommended strength (N 2^15, r 8,
// p 3: 32 MB a hash, the same work as 2^17 with p 1 in a quarter of the
// memory, for a small server). A hash made at the older strength is
// remade at this one the next time its password is entered (needsRehash).
// A session token is 32 random bytes, handed to the device once; the
// server keeps only its SHA-256. A session lasts SESSION_DAYS from when it
// was last used.

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 32768, r: 8, p: 3, keylen: 64 };
// (Node allows 32 MB by default: room for this strength.)
const MAXMEM = 128 * 1024 * 1024;
export const SESSION_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;
// (A session's last use is saved at most this often.)
const TOUCH_EVERY = 10 * 60 * 1000;

export const MIN_PASSWORD = 8;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAXMEM });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  // (No password is longer than this: a huge one isn't worth hashing.)
  if (typeof password !== "string" || password.length > 200) return false;
  const [kind, N, r, p, salt, hash] = String(stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(String(password), Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: MAXMEM });
  return crypto.timingSafeEqual(actual, expected);
}

// Whether a stored hash was made at an older strength (and so is remade
// once its password is entered and checked).
export function needsRehash(stored) {
  const [kind, N, r, p] = String(stored ?? "").split("$");
  return kind !== "scrypt" || Number(N) !== SCRYPT.N || Number(r) !== SCRYPT.r || Number(p) !== SCRYPT.p;
}

// (Checked against when there's no such account, so a wrong email takes as
// long to answer as a wrong password.)
const DECOY = hashPassword(crypto.randomBytes(16).toString("hex"));
export const verifyDecoy = async (password) => verifyPassword(password, await DECOY);

// The 10,000 most common passwords (SecLists, Passwords/Common-Credentials/
// 10k-most-common.txt; lower-cased), refused as new ones — what NIST
// recommends in place of rules about symbols and capitals, which only
// lead to "Password1!".
const COMMON = new Set(fs.readFileSync(new URL("../data/common-passwords.txt", import.meta.url), "utf8").split("\n").map((p) => p.trim()).filter(Boolean));

// What's wrong with a new password, if anything. (`email`: the account's —
// a password that's just the email, or its name part, is refused too.)
export function passwordProblem(password, email = "") {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return "That password is too long.";
  const plain = password.trim().toLowerCase();
  const name = String(email).toLowerCase().split("@")[0];
  if (COMMON.has(plain) || COMMON.has(plain.replace(/[^a-z0-9]+$/, "")) || /^(.)\1+$/.test(plain)) return "That's one of the most common passwords — choose something less guessable (a few words together works well).";
  if (plain === String(email).toLowerCase() || (name.length >= 4 && plain.includes(name))) return "Don't use your email in your password.";
  if (/orbit|bentobuilder/.test(plain) && plain.replace(/orbit|bentobuilder|[^a-z]/g, "").length < 4) return "Choose something less guessable than the app's name.";
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

export const BLOCKED = "This account has been turned off. Ask whoever runs your Orbit.";

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
// lock an account out with a handful of tries). Kept in the database
// (models/AuthFailure.js, each key as its SHA-256), so a restart doesn't
// reset them; gone once their window has passed.
const LIMIT = { perAddress: 20, perEmailHere: 5, perEmail: 50 };
const WINDOW = 15 * 60 * 1000;

const keyOf = (key) => sha256(`auth-failure:${key}`);

// Minutes to wait before trying again, or 0.
export async function waitMinutes(keys) {
  const found = await AuthFailure.find({ key: { $in: keys.map(([key]) => keyOf(key)) }, since: { $gt: new Date(Date.now() - WINDOW) } }).lean();
  for (const [key, limit] of keys) {
    const entry = found.find((f) => f.key === keyOf(key));
    if (entry && entry.count >= limit) return Math.max(1, Math.ceil((entry.since.getTime() + WINDOW - Date.now()) / 60000));
  }
  return 0;
}

export async function noteFailure(keys) {
  const now = new Date();
  for (const [key] of keys) {
    const k = keyOf(key);
    // (A window that's passed starts again.)
    await AuthFailure.deleteOne({ key: k, since: { $lte: new Date(now.getTime() - WINDOW) } });
    await AuthFailure.updateOne({ key: k }, { $inc: { count: 1 }, $setOnInsert: { since: now, expiresAt: new Date(now.getTime() + WINDOW) } }, { upsert: true });
  }
}

export const clearFailures = async (keys) => {
  await AuthFailure.deleteMany({ key: { $in: keys.map(([key]) => keyOf(key)) } });
};

// The limiter keys for a request: its address, and the email if there is
// one. (Only a real-looking email is kept: anything else — a huge string
// sent to fill the server's memory — counts against the address alone.)
export const attemptKeys = (req, email) => [
  [`ip:${req.ip}`, LIMIT.perAddress],
  ...(email && isEmail(email) ? [[`email:${email}|ip:${req.ip}`, LIMIT.perEmailHere], [`email:${email}`, LIMIT.perEmail]] : []),
];
