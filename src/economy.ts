import { addBalance, getWallet, setLastDaily, topRich } from "./db.js";

export type DailyResult =
  | { ok: true; amount: number; balance: number }
  | { ok: false; msRemaining: number; balance: number };

export function getBalance(userId: string) {
  return getWallet(userId).balance;
}
export function canAfford(userId: string, amount: number) {
  return getWallet(userId).balance >= amount;
}
export function credit(userId: string, amount: number) {
  addBalance(userId, amount);
  return getBalance(userId);
}
export function debit(userId: string, amount: number) {
  if (!canAfford(userId, amount)) throw new Error("Insufficient funds");
  addBalance(userId, -amount);
  return getBalance(userId);
}
export function grantDaily(userId: string, now = Date.now()): DailyResult {
  const DAILY = Number(process.env.DAILY_AMOUNT ?? 1000);
  const w = getWallet(userId);
  const elapsed = now - w.last_daily;
  const DAY = 24 * 60 * 60 * 1000;
  if (elapsed < DAY) {
    const left = DAY - elapsed;
    return { ok: false, msRemaining: left, balance: w.balance };
  }
  credit(userId, DAILY);
  setLastDaily(userId, now);
  return { ok: true, amount: DAILY, balance: getBalance(userId) };
}
export function transfer(fromId: string, toId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be positive");
  debit(fromId, amount);
  credit(toId, amount);
  return { from: getBalance(fromId), to: getBalance(toId) };
}
export function leaderboard(limit = 10) {
  return topRich(limit);
}
