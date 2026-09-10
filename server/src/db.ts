// Persistence: accounts, sessions, saved decks. Uses Node's built-in synchronous
// SQLite (node:sqlite) so there is no native build step. Hand-rolled query
// helpers in the same spirit as the rest of this server (no ORM).

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import type { Gamemode } from "@mtg/shared";

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), "server/data/app.db");

if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// --- schema (idempotent) ---------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  passwordHash  TEXT NOT NULL,
  passwordSalt  TEXT NOT NULL,
  displayName   TEXT NOT NULL,
  createdAt     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt  INTEGER NOT NULL,
  expiresAt  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);
CREATE TABLE IF NOT EXISTS decks (
  id             TEXT PRIMARY KEY,
  userId         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  text           TEXT NOT NULL,
  gamemode       TEXT NOT NULL,
  cardCount      INTEGER NOT NULL,
  commanderCount INTEGER NOT NULL,
  coverImage     TEXT,
  createdAt      INTEGER NOT NULL,
  updatedAt      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(userId);
`);

// --- row types -----------------------------------------------------------
export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  displayName: string;
  createdAt: number;
}
export interface SessionRow {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}
export interface DeckRow {
  id: string;
  userId: string;
  name: string;
  text: string;
  gamemode: Gamemode;
  cardCount: number;
  commanderCount: number;
  coverImage: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Public shape of a deck for list views (no decklist text). */
export type DeckSummary = Omit<DeckRow, "text" | "userId">;

const now = () => Date.now();

// --- users --------------------------------------------------------------
export const Users = {
  create(email: string, passwordHash: string, passwordSalt: string, displayName: string): UserRow {
    const row: UserRow = {
      id: randomUUID(),
      email: email.trim().toLowerCase(),
      passwordHash,
      passwordSalt,
      displayName: displayName.trim().slice(0, 40) || "Planeswalker",
      createdAt: now(),
    };
    db.prepare(
      `INSERT INTO users (id, email, passwordHash, passwordSalt, displayName, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.email, row.passwordHash, row.passwordSalt, row.displayName, row.createdAt);
    return row;
  },
  byEmail(email: string): UserRow | undefined {
    return db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as
      | UserRow
      | undefined;
  },
  byId(id: string): UserRow | undefined {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  },
};

// --- sessions ---------------------------------------------------------
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const Sessions = {
  create(userId: string, token: string): SessionRow {
    const row: SessionRow = {
      token,
      userId,
      createdAt: now(),
      expiresAt: now() + SESSION_TTL_MS,
    };
    db.prepare(
      "INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
    ).run(row.token, row.userId, row.createdAt, row.expiresAt);
    return row;
  },
  /** Resolve a session token to its user, deleting it if expired. */
  resolve(token: string | undefined): UserRow | undefined {
    if (!token) return undefined;
    const row = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as
      | SessionRow
      | undefined;
    if (!row) return undefined;
    if (row.expiresAt < now()) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return undefined;
    }
    return Users.byId(row.userId);
  },
  destroy(token: string | undefined): void {
    if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  },
};

// --- decks ----------------------------------------------------------
export interface DeckInput {
  name: string;
  text: string;
  gamemode: Gamemode;
  cardCount: number;
  commanderCount: number;
  coverImage: string | null;
}

const toSummary = (r: DeckRow): DeckSummary => ({
  id: r.id,
  name: r.name,
  gamemode: r.gamemode,
  cardCount: r.cardCount,
  commanderCount: r.commanderCount,
  coverImage: r.coverImage,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const Decks = {
  create(userId: string, input: DeckInput): DeckRow {
    const row: DeckRow = {
      id: randomUUID(),
      userId,
      name: input.name.trim().slice(0, 80) || "Untitled deck",
      text: input.text,
      gamemode: input.gamemode,
      cardCount: input.cardCount,
      commanderCount: input.commanderCount,
      coverImage: input.coverImage,
      createdAt: now(),
      updatedAt: now(),
    };
    db.prepare(
      `INSERT INTO decks (id, userId, name, text, gamemode, cardCount, commanderCount, coverImage, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id, row.userId, row.name, row.text, row.gamemode,
      row.cardCount, row.commanderCount, row.coverImage, row.createdAt, row.updatedAt,
    );
    return row;
  },
  listFor(userId: string): DeckSummary[] {
    const rows = db
      .prepare("SELECT * FROM decks WHERE userId = ? ORDER BY updatedAt DESC")
      .all(userId) as unknown as DeckRow[];
    return rows.map(toSummary);
  },
  get(id: string): DeckRow | undefined {
    return db.prepare("SELECT * FROM decks WHERE id = ?").get(id) as DeckRow | undefined;
  },
  update(id: string, input: DeckInput): DeckRow | undefined {
    const existing = Decks.get(id);
    if (!existing) return undefined;
    const merged: DeckRow = {
      ...existing,
      name: input.name.trim().slice(0, 80) || existing.name,
      text: input.text,
      gamemode: input.gamemode,
      cardCount: input.cardCount,
      commanderCount: input.commanderCount,
      coverImage: input.coverImage,
      updatedAt: now(),
    };
    db.prepare(
      `UPDATE decks SET name=?, text=?, gamemode=?, cardCount=?, commanderCount=?, coverImage=?, updatedAt=?
       WHERE id=?`,
    ).run(
      merged.name, merged.text, merged.gamemode, merged.cardCount,
      merged.commanderCount, merged.coverImage, merged.updatedAt, id,
    );
    return merged;
  },
  remove(id: string): void {
    db.prepare("DELETE FROM decks WHERE id = ?").run(id);
  },
  summary: toSummary,
};
