import { credit, debit } from "../economy.js";
export type Side = "heads" | "tails";
export function playCoinflip(userId: string, wager: number, pick: Side) {
  if (wager <= 0) throw new Error("Wager must be positive");
  debit(userId, wager);
  const roll = Math.random() < 0.5 ? "heads" : "tails";
  const win = roll === pick;
  if (win) credit(userId, wager * 2);
  return { roll, win };
}
