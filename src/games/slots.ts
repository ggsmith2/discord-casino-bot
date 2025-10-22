import { credit, debit } from "../economy.js";

const symbols = ["🍒", "🍋", "🔔", "⭐", "7️⃣"];
const weights = [0.3, 0.3, 0.2, 0.15, 0.05];

function spinOne() {
  const roll = Math.random();
  let cumulative = 0;
  for (let i = 0; i < symbols.length; i++) {
    cumulative += weights[i];
    if (roll <= cumulative) return symbols[i];
  }
  return symbols[symbols.length - 1];
}

export function playSlots(userId: string, wager: number) {
  if (wager <= 0) throw new Error("Wager must be positive");
  debit(userId, wager);
  const reels = [spinOne(), spinOne(), spinOne()];
  let payout = 0;
  const [a, b, c] = reels;
  if (a === b && b === c) payout = a === "7️⃣" ? wager * 15 : wager * 5;
  else if (a === b || b === c || a === c) payout = Math.round(wager * 1.5);
  if (payout > 0) credit(userId, payout);
  return { reels, payout };
}
