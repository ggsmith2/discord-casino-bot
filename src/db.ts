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
    last_daily INTEGER NOT NULL DEFAULT 0
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
