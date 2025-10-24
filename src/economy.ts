import {
  addBalance,
  addXp,
  adjustVaultBalance,
  banCharacter,
  factionStats as factionStatsDb,
  getFaction,
  getLoreHistory,
  getStats as getProgressDb,
  getVaultBalance,
  getWallet,
  listInventory,
  recordLore,
  setRule,
  getRules,
  setLastDaily,
  setFaction,
  topRich,
  unbanCharacter,
  upsertInventory
} from "./db.js";

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

export function grantXp(userId: string, amount: number) {
  return addXp(userId, amount);
}

export function getProgress(userId: string) {
  return getProgressDb(userId);
}

export function addItem(userId: string, item: string, qty: number) {
  upsertInventory(userId, item, qty);
  return listInventory(userId);
}

export function getInventory(userId: string) {
  return listInventory(userId);
}

export function alignFaction(userId: string, faction: string) {
  setFaction(userId, faction);
  return getFaction(userId);
}

export function vaultBalance() {
  return getVaultBalance();
}

export function adjustVault(delta: number) {
  return adjustVaultBalance(delta);
}

export function addLore(userId: string, topic: string, detail: string) {
  recordLore(userId, topic, detail);
}

export function loreHistory(userId: string) {
  return getLoreHistory(userId);
}

export function addBan(userId: string, character: string) {
  banCharacter(userId, character);
}

export function removeBan(userId: string, character: string) {
  unbanCharacter(userId, character);
}

export function factionSnapshot() {
  return factionStatsDb();
}

export function updateRule(key: string, value: string) {
  setRule(key, value);
}

export function currentRules() {
  return getRules();
}
