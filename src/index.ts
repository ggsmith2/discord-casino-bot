import "dotenv/config";
import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionsBitField
} from "discord.js";
import { canAfford, credit, getBalance, grantDaily, leaderboard } from "./economy.js";
import { playBlackjack } from "./games/blackjack.js";
import { playCoinflip } from "./games/coinflip.js";
import { playSlots } from "./games/slots.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function money(n: number) {
  return new Intl.NumberFormat().format(n);
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    switch (interaction.commandName) {
      case "help":
        return help(interaction);
      case "balance":
        return balance(interaction);
      case "daily":
        return daily(interaction);
      case "leaderboard":
        return showLeaderboard(interaction);
      case "give":
        return give(interaction);
      case "bet":
        return bet(interaction);
      default:
        return interaction.reply({ content: "Unknown command.", ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true }).catch(() => {});
  }
});

async function help(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🎰 Casino Commands")
    .setDescription(
      [
        "`/balance` — check your wallet",
        "`/daily` — claim your daily cash",
        "`/leaderboard` — richest players",
        "`/bet coinflip side:<heads|tails> amount:<n>`",
        "`/bet slots amount:<n>`",
        "`/bet blackjack amount:<n>`",
        "`/give user:<@> amount:<n>` (admins only)"
      ].join("\n")
    )
    .setColor(0x00c2ff);
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function balance(interaction: ChatInputCommandInteraction) {
  const bal = getBalance(interaction.user.id);
  return interaction.reply({ content: `💳 **${interaction.user.username}** balance: **$${money(bal)}**` });
}

async function daily(interaction: ChatInputCommandInteraction) {
  const result = grantDaily(interaction.user.id);
  if (!result.ok) {
    const minutes = Math.ceil(result.msRemaining / 60000);
    return interaction.reply({
      content: `⏳ Daily already claimed. Try again in **~${minutes} min**.`,
      ephemeral: true
    });
  }
  return interaction.reply({
    content: `✅ Claimed **$${money(result.amount)}**! New balance: **$${money(result.balance)}**`
  });
}

async function showLeaderboard(interaction: ChatInputCommandInteraction) {
  const top = leaderboard(10);
  if (top.length === 0) return interaction.reply("Nobody has any money yet!");
  const lines = top.map((row, index) => `**${index + 1}.** <@${row.user_id}> — $${money(row.balance)}`);
  return interaction.reply({ content: `🏆 **Leaderboard**\n${lines.join("\n")}` });
}

async function give(interaction: ChatInputCommandInteraction) {
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  const hasPerms = member?.permissions.has(PermissionsBitField.Flags.ManageGuild);
  if (!hasPerms) {
    return interaction.reply({ content: "❌ You need **Manage Server** permission.", ephemeral: true });
  }

  const user = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  if (amount <= 0) {
    return interaction.reply({ content: "Amount must be positive.", ephemeral: true });
  }

  credit(user.id, amount);
  return interaction.reply(`💸 Granted **$${money(amount)}** to <@${user.id}>.`);
}

async function bet(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);
  const amount = interaction.options.getInteger("amount", true);
  if (amount <= 0) return interaction.reply({ content: "Wager must be positive.", ephemeral: true });
  if (!canAfford(interaction.user.id, amount)) {
    return interaction.reply({ content: "❌ You can’t afford that wager.", ephemeral: true });
  }

  if (sub === "coinflip") {
    const side = interaction.options.getString("side", true) as "heads" | "tails";
    const { roll, win } = playCoinflip(interaction.user.id, amount, side);
    return interaction.reply(
      `${interaction.user} bet **$${money(amount)}** on **${side}** → **${roll}** → ${
        win ? "🎉 **WIN!**" : "💀 **LOSE**"
      }`
    );
  }

  if (sub === "slots") {
    const { reels, payout } = playSlots(interaction.user.id, amount);
    const won = payout > 0;
    return interaction.reply(
      `${interaction.user} pulled the slots for **$${money(amount)}**\n${reels.join(" | ")}\n${
        won ? `🎉 **WIN $${money(payout)}!**` : "💀 **LOSE**"
      }`
    );
  }

  if (sub === "blackjack") {
    const result = playBlackjack(interaction.user.id, amount);
    return interaction.reply(`${interaction.user}\n${result.render()}`);
  }

  return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
}

client.login(process.env.BOT_TOKEN);
