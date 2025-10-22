import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Show casino commands"),
  new SlashCommandBuilder().setName("balance").setDescription("Show your wallet balance"),
  new SlashCommandBuilder().setName("daily").setDescription("Claim your daily cash"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Top balances"),
  new SlashCommandBuilder()
    .setName("give")
    .setDescription("Admin: grant currency")
    .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true)),
  new SlashCommandBuilder()
    .setName("bet")
    .setDescription("Play a casino game")
    .addSubcommand((s: SlashCommandSubcommandBuilder) =>
      s.setName("coinflip")
        .setDescription("Heads or tails")
        .addStringOption(o =>
          o
            .setName("side")
            .setDescription("heads or tails")
            .setRequired(true)
            .addChoices({ name: "heads", value: "heads" }, { name: "tails", value: "tails" })
        )
        .addIntegerOption(o => o.setName("amount").setDescription("Wager").setRequired(true))
    )
    .addSubcommand(s =>
      s
        .setName("slots")
        .setDescription("Spin the slots")
        .addIntegerOption(o => o.setName("amount").setDescription("Wager").setRequired(true))
    )
    .addSubcommand(s =>
      s
        .setName("blackjack")
        .setDescription("Auto blackjack vs dealer")
        .addIntegerOption(o => o.setName("amount").setDescription("Wager").setRequired(true))
    )
].map(c => c.toJSON());
