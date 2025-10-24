import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";

const commandBuilders = [
  new SlashCommandBuilder().setName("help").setDescription("Show bot help"),
  new SlashCommandBuilder().setName("ping").setDescription("Ping the bot"),
  new SlashCommandBuilder().setName("menu").setDescription("Open the Vault Casino interactive menu"),
  new SlashCommandBuilder().setName("save").setDescription("Save your Vault Casino progress"),
  new SlashCommandBuilder().setName("load").setDescription("Load your previously saved progress"),
  new SlashCommandBuilder()
    .setName("npc")
    .setDescription("Enable or disable the AI NPC for this server")
    .addBooleanOption(o => o.setName("enabled").setDescription("Enable AI NPC").setRequired(true))
    .addIntegerOption(o =>
      o
        .setName("cooldown")
        .setDescription("Optional cooldown in seconds between AI interactions (15-300)")
        .setMinValue(15)
        .setMaxValue(300)
        .setRequired(false)
    ),
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
      s
        .setName("coinflip")
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
    ),
  // Gameplay & World Interaction Commands
  new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Run slots for a character and wager")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true))
    .addNumberOption(o => o.setName("amount").setDescription("Amount to wager").setRequired(true)),
  new SlashCommandBuilder()
    .setName("gamble")
    .setDescription("Gamble a specific amount")
    .addNumberOption(o => o.setName("amount").setDescription("Amount to gamble").setRequired(true)),
  new SlashCommandBuilder()
    .setName("vaultaccess")
    .setDescription("Interact with the shared Vault pool")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true))
    .addStringOption(o =>
      o
        .setName("action")
        .setDescription("Deposit to or withdraw from the pool")
        .setRequired(true)
        .addChoices({ name: "Deposit", value: "deposit" }, { name: "Withdraw", value: "withdraw" })
    )
    .addNumberOption(o => o.setName("amount").setDescription("Amount of chips").setRequired(true)),
  new SlashCommandBuilder()
    .setName("riftopen")
    .setDescription("Open a rift at a location")
    .addStringOption(o => o.setName("location").setDescription("Location to open the rift").setRequired(true)),
  new SlashCommandBuilder()
    .setName("summonbiome")
    .setDescription("Summon a biome into the Vault")
    .addStringOption(o => o.setName("biome").setDescription("Biome name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("duel")
    .setDescription("Initiate a duel between two characters")
    .addStringOption(o => o.setName("character1").setDescription("First character").setRequired(true))
    .addStringOption(o => o.setName("character2").setDescription("Second character").setRequired(true))
    .addNumberOption(o => o.setName("wager").setDescription("Optional wager in chips")),
  new SlashCommandBuilder()
    .setName("divinetrial")
    .setDescription("Begin a divine trial for a character")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("ascend")
    .setDescription("Ascend a character")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("factionalign")
    .setDescription("Align a character with a faction")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true))
    .addStringOption(o => o.setName("faction").setDescription("Faction name").setRequired(true)),
  new SlashCommandBuilder().setName("balancecheck").setDescription("Check balance status"),
  new SlashCommandBuilder()
    .setName("resetbalance")
    .setDescription("Reset balance for a character")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true)),
  new SlashCommandBuilder().setName("showreels").setDescription("Show current reels"),
  new SlashCommandBuilder().setName("casinostart").setDescription("Start the casino event"),
  // Lore & Narrative Commands
  new SlashCommandBuilder()
    .setName("loredrop")
    .setDescription("Drop lore about a topic")
    .addStringOption(o => o.setName("topic").setDescription("Lore topic").setRequired(true)),
  new SlashCommandBuilder()
    .setName("echoreveal")
    .setDescription("Reveal echoes for a character")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("prophecy")
    .setDescription("Deliver a prophecy for a character")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("rewritetimeline")
    .setDescription("Rewrite the timeline for an event")
    .addStringOption(o => o.setName("event").setDescription("Event name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("fracturetimeline")
    .setDescription("Fracture the timeline at an event")
    .addStringOption(o => o.setName("event").setDescription("Event name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("mergeecho")
    .setDescription("Merge echoes of two characters")
    .addStringOption(o => o.setName("character1").setDescription("First character").setRequired(true))
    .addStringOption(o => o.setName("character2").setDescription("Second character").setRequired(true)),
  new SlashCommandBuilder()
    .setName("relicforge")
    .setDescription("Forge a relic")
    .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("relictracker")
    .setDescription("Track a relic")
    .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("npcmemory")
    .setDescription("Recall an NPC memory for a character")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("summon")
    .setDescription("Summon a faction or NPC")
    .addStringOption(o => o.setName("target").setDescription("Faction or NPC").setRequired(true)),
  new SlashCommandBuilder()
    .setName("rewritevaultlaw")
    .setDescription("Rewrite a vault law")
    .addStringOption(o => o.setName("law").setDescription("Law name").setRequired(true)),
  // Meta & System Commands
  new SlashCommandBuilder().setName("factionstats").setDescription("View faction statistics"),
  new SlashCommandBuilder().setName("loreaudit").setDescription("Run a lore audit"),
  new SlashCommandBuilder().setName("balanceofeveryone").setDescription("Check the balance of everyone"),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a character")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("undoban")
    .setDescription("Undo a ban for a character")
    .addStringOption(o => o.setName("character").setDescription("Character name").setRequired(true))
];

const seen = new Set<string>();
const uniqueBuilders = commandBuilders.filter(builder => {
  const name = builder.name;
  if (seen.has(name)) {
    return false;
  }
  seen.add(name);
  return true;
});

export const definitions = uniqueBuilders.map(builder => builder.toJSON());
