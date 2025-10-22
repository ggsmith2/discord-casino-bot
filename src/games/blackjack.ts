import { credit, debit } from "../economy.js";

type Card = { rank: string; value: number; emoji: string };

const ranks: [string, number, string][] = [
  ["A", 11, "🂱"],
  ["K", 10, "🂮"],
  ["Q", 10, "🂭"],
  ["J", 10, "🂫"],
  ["10", 10, "🂪"],
  ["9", 9, "🂩"],
  ["8", 8, "🂨"],
  ["7", 7, "🂧"],
  ["6", 6, "🂦"],
  ["5", 5, "🂥"],
  ["4", 4, "🂤"],
  ["3", 3, "🂣"],
  ["2", 2, "🂢"]
];

function draw(): Card {
  const [rank, value, emoji] = ranks[Math.floor(Math.random() * ranks.length)];
  return { rank, value, emoji };
}

function score(hand: Card[]) {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter(card => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function playBlackjack(userId: string, wager: number) {
  if (wager <= 0) throw new Error("Wager must be positive");
  debit(userId, wager);
  const player = [draw(), draw()];
  const dealer = [draw(), draw()];
  while (score(player) < 16) player.push(draw());
  while (score(dealer) < 17) dealer.push(draw());
  const playerScore = score(player);
  const dealerScore = score(dealer);
  let result: "win" | "push" | "lose" = "lose";
  if (playerScore > 21) result = "lose";
  else if (dealerScore > 21 || playerScore > dealerScore) result = "win";
  else if (playerScore === dealerScore) result = "push";

  let payout = 0;
  if (result === "win") payout = wager * 2;
  if (result === "push") payout = wager;
  if (payout > 0) credit(userId, payout);

  return {
    player,
    dealer,
    ps: playerScore,
    ds: dealerScore,
    result,
    render: () =>
      `**You:** ${player.map(card => card.emoji).join(" ")} (${playerScore})\n` +
      `**Dealer:** ${dealer.map(card => card.emoji).join(" ")} (${dealerScore})\n` +
      `**Result:** ${result.toUpperCase()} ${payout > 0 ? `(+${payout})` : ""}`
  };
}
