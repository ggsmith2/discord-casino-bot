import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "casino.sqlite");

export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    last_daily INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS inventory (
    user_id TEXT NOT NULL,
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, item)
  );

  CREATE TABLE IF NOT EXISTS factions (
    user_id TEXT PRIMARY KEY,
    faction TEXT NOT NULL,
    joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS bans (
    user_id TEXT NOT NULL,
    character TEXT NOT NULL,
    banned_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (user_id, character)
  );

  CREATE TABLE IF NOT EXISTS duel_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger TEXT NOT NULL,
    opponent TEXT NOT NULL,
    winner TEXT NOT NULL,
    wager INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS lore_discoveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS vault_pool (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    balance INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS vault_rules (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function getWallet(userId: string) {
  const row = db.prepare("SELECT user_id, balance, last_daily FROM wallets WHERE user_id = ?").get(userId);
  if (row) return row as { user_id: string; balance: number; last_daily: number };
  db.prepare("INSERT INTO wallets (user_id, balance, last_daily) VALUES (?, ?, 0)")
    .run(userId, Number(process.env.STARTING_CASH ?? 5000));
  return db.prepare("SELECT user_id, balance, last_daily FROM wallets WHERE user_id = ?").get(userId) as any;
}

export function addBalance(userId: string, delta: number) {
  db.prepare("UPDATE wallets SET balance = balance + ? WHERE user_id = ?").run(delta, userId);
}
export function setLastDaily(userId: string, ts: number) {
  db.prepare("UPDATE wallets SET last_daily = ? WHERE user_id = ?").run(ts, userId);
}
export function topRich(limit = 10) {
  return db.prepare("SELECT user_id, balance FROM wallets ORDER BY balance DESC LIMIT ?").all(limit) as { user_id: string; balance: number }[];
}

export function addXp(userId: string, amount: number) {
  if (amount <= 0) return getStats(userId);
  db.prepare("UPDATE wallets SET xp = xp + ? WHERE user_id = ?").run(amount, userId);
  const stats = getStats(userId);
  const nextLevelThreshold = (stats.level ** 2) * 100;
  if (stats.xp >= nextLevelThreshold) {
    db.prepare("UPDATE wallets SET level = level + 1, xp = xp - ? WHERE user_id = ?").run(nextLevelThreshold, userId);
  }
  return getStats(userId);
}

export function getStats(userId: string) {
  const row = db.prepare("SELECT xp, level FROM wallets WHERE user_id = ?").get(userId);
  if (!row) {
    addBalance(userId, 0);
    return { xp: 0, level: 1 };
  }
  return row as { xp: number; level: number };
}

export function upsertInventory(userId: string, item: string, delta: number) {
  const row = db.prepare("SELECT quantity FROM inventory WHERE user_id = ? AND item = ?").get(userId, item) as { quantity: number } | undefined;
  if (!row) {
    db.prepare("INSERT INTO inventory (user_id, item, quantity) VALUES (?, ?, ?)").run(userId, item, Math.max(delta, 0));
  } else {
    const newQty = Math.max(0, row.quantity + delta);
    db.prepare("UPDATE inventory SET quantity = ? WHERE user_id = ? AND item = ?").run(newQty, userId, item);
    if (newQty === 0) {
      db.prepare("DELETE FROM inventory WHERE user_id = ? AND item = ?").run(userId, item);
    }
  }
}

export function listInventory(userId: string) {
  return db
    .prepare("SELECT item, quantity FROM inventory WHERE user_id = ? ORDER BY item ASC")
    .all(userId) as { item: string; quantity: number }[];
}

export function setFaction(userId: string, faction: string) {
  db.prepare("INSERT INTO factions (user_id, faction, joined_at) VALUES (?, ?, strftime('%s','now')) ON CONFLICT(user_id) DO UPDATE SET faction=excluded.faction, joined_at=excluded.joined_at").run(userId, faction);
}

export function getFaction(userId: string) {
  return db.prepare("SELECT faction, joined_at FROM factions WHERE user_id = ?").get(userId) as { faction: string; joined_at: number } | undefined;
}

export function factionStats() {
  return db
    .prepare("SELECT faction, COUNT(*) as members FROM factions GROUP BY faction ORDER BY members DESC")
    .all() as { faction: string; members: number }[];
}

export function banCharacter(userId: string, character: string) {
  db.prepare("INSERT OR REPLACE INTO bans (user_id, character, banned_at) VALUES (?, ?, strftime('%s','now'))").run(userId, character);
}

export function unbanCharacter(userId: string, character: string) {
  db.prepare("DELETE FROM bans WHERE user_id = ? AND character = ?").run(userId, character);
}

export function isBanned(userId: string, character: string) {
  const row = db.prepare("SELECT 1 FROM bans WHERE user_id = ? AND character = ?").get(userId, character);
  return !!row;
}

export function logDuel(challenger: string, opponent: string, winner: string, wager: number) {
  db.prepare("INSERT INTO duel_logs (challenger, opponent, winner, wager) VALUES (?, ?, ?, ?)").run(challenger, opponent, winner, wager);
}

export function recordLore(userId: string, topic: string, detail: string) {
  db.prepare("INSERT INTO lore_discoveries (user_id, topic, detail) VALUES (?, ?, ?)").run(userId, topic, detail);
}

export function getLoreHistory(userId: string) {
  return db
    .prepare("SELECT topic, detail, created_at FROM lore_discoveries WHERE user_id = ? ORDER BY created_at DESC LIMIT 10")
    .all(userId) as { topic: string; detail: string; created_at: number }[];
}

export function getVaultBalance() {
  const row = db.prepare("SELECT balance FROM vault_pool WHERE id = 1").get() as { balance: number } | undefined;
  if (!row) {
    db.prepare("INSERT INTO vault_pool (id, balance) VALUES (1, 0)").run();
    return 0;
  }
  return row.balance as number;
}

export function adjustVaultBalance(delta: number) {
  db.prepare("INSERT INTO vault_pool (id, balance) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET balance = balance + excluded.balance").run(delta);
  const current = getVaultBalance();
  if (current < 0) {
    db.prepare("UPDATE vault_pool SET balance = 0 WHERE id = 1").run();
    return 0;
  }
  return current;
}

export function setRule(key: string, value: string) {
  db.prepare("INSERT INTO vault_rules (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getRules() {
  return db.prepare("SELECT key, value FROM vault_rules").all() as { key: string; value: string }[];
}
