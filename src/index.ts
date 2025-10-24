import "dotenv/config";
import {
  ActivityType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionsBitField,
  type Guild,
  type GuildMember
} from "discord.js";
import { canAfford, credit, getBalance, grantDaily, leaderboard } from "./economy.js";
import { playBlackjack } from "./games/blackjack.js";
import { playCoinflip } from "./games/coinflip.js";
import { playSlots } from "./games/slots.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const bannedCharacters = new Set<string>();

function money(n: number) {
  return new Intl.NumberFormat().format(n);
}

async function findMember(guild: Guild | null, name: string) {
  if (!guild) return null;
  const lowered = name.toLowerCase();
  try {
    await guild.members.fetch();
  } catch {
    // Missing privileged intents; fall back to cache.
  }
  return (
    guild.members.cache.find(
      member =>
        member.user.username.toLowerCase() === lowered ||
        member.displayName.toLowerCase() === lowered
    ) ?? null
  );
}

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  client.user?.setPresence({
    activities: [{ name: "Vault Casino Online 🎲", type: ActivityType.Playing }],
    status: "online"
  });
});

const commandHandlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<unknown>> = {
  help,
  ping: handlePing,
  balance,
  daily,
  leaderboard: showLeaderboard,
  give,
  bet,
  slots: handleSlotsCommand,
  gamble: handleGambleCommand,
  vaultaccess: handleVaultAccessCommand,
  riftopen: handleRiftOpenCommand,
  summonbiome: handleSummonBiomeCommand,
  duel: handleDuelCommand,
  divinetrial: handleDivineTrialCommand,
  ascend: handleAscendCommand,
  factionalign: handleFactionAlignCommand,
  balancecheck: handleBalanceCheckCommand,
  resetbalance: handleResetBalanceCommand,
  showreels: handleShowReelsCommand,
  casinostart: handleCasinoStartCommand,
  loredrop: handleLoreDropCommand,
  echoreveal: handleEchoRevealCommand,
  prophecy: handleProphecyCommand,
  rewritetimeline: handleRewriteTimelineCommand,
  fracturetimeline: handleFractureTimelineCommand,
  mergeecho: handleMergeEchoCommand,
  relicforge: handleRelicForgeCommand,
  relictracker: handleRelicTrackerCommand,
  npcmemory: handleNpcMemoryCommand,
  summon: handleSummonCommand,
  rewritevaultlaw: handleRewriteVaultLawCommand,
  factionstats: handleFactionStatsCommand,
  loreaudit: handleLoreAuditCommand,
  balanceofeveryone: handleBalanceOfEveryoneCommand,
  ban: handleBanCommand,
  undoban: handleUndoBanCommand
};

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const handler = commandHandlers[interaction.commandName];
  if (!handler) {
    await interaction.reply({ content: "Unknown command.", ephemeral: true }).catch(() => {});
    return;
  }
  try {
    await handler(interaction);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true }).catch(() => {});
  }
});

async function handlePing(interaction: ChatInputCommandInteraction) {
  return interaction.reply("🏓 Pong! The Vault echoes back your call.");
}

async function help(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🎰 Vault Casino Command Guide")
    .setDescription("Spin the reels, rewrite fate, or audit the Vault itself.")
    .addFields(
      {
        name: "Core",
        value:
          "`/balance`, `/daily`, `/leaderboard`, `/give`, `/bet coinflip|slots|blackjack`, `/slots`, `/gamble`"
      },
      {
        name: "Lore",
        value: "`/loredrop`, `/prophecy`, `/rewritetimeline`, `/fracturetimeline`, `/mergeecho`, `/summon`"
      },
      {
        name: "Systems",
        value: "`/factionstats`, `/loreaudit`, `/balanceofeveryone`, `/ban`, `/undoban`"
      }
    )
    .setColor(0xffc107);
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function balance(interaction: ChatInputCommandInteraction) {
  const bal = getBalance(interaction.user.id);
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("💳 Vault Ledger")
        .setDescription(`**${interaction.user.username}** holds **$${money(bal)}** in chips.`)
        .setColor(0x00bcd4)
    ]
  });
}

async function daily(interaction: ChatInputCommandInteraction) {
  const result = grantDaily(interaction.user.id);
  if (!result.ok) {
    const minutes = Math.ceil(result.msRemaining / 60000);
    return interaction.reply({
      content: `⏳ Daily chips already claimed. Return in **~${minutes} min**.`,
      ephemeral: true
    });
  }
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🪙 Daily Payout")
        .setDescription(`You claimed **$${money(result.amount)}**! New balance: **$${money(result.balance)}**.`)
        .setColor(0x4caf50)
    ]
  });
}

async function showLeaderboard(interaction: ChatInputCommandInteraction) {
  const top = leaderboard(10);
  if (top.length === 0) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏆 Vault Leaderboard")
          .setDescription("No challengers have amassed any wealth yet.")
          .setColor(0x757575)
      ]
    });
  }
  const guild = interaction.guild ?? null;
  const positions = await Promise.all(
    top.map(async (row, index) => {
      const member = guild ? await findMember(guild, row.user_id) : null;
      const name = member ? member.displayName : `Traveler ${row.user_id.slice(-4)}`;
      const status = member?.presence?.status ?? "offline";
      const statusEmoji =
        status === "online" ? "🟢" : status === "idle" ? "🟡" : status === "dnd" ? "🔴" : "⚫";
      return `**${index + 1}.** ${statusEmoji} ${name} — **$${money(row.balance)}**`;
    })
  );
  const embed = new EmbedBuilder()
    .setTitle("🏆 Vault Leaderboard")
    .setDescription(positions.join("\n"))
    .setColor(0xff5722)
    .setFooter({ text: "Top 10 richest patrons in the Vault" });
  return interaction.reply({ embeds: [embed] });
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
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("💸 Vault Transfer")
        .setDescription(`Granted **$${money(amount)}** to <@${user.id}>.`)
        .setColor(0x8bc34a)
    ]
  });
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

async function handleSlotsCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  const amount = interaction.options.getNumber("amount");
  if (!character || amount == null) {
    return interaction.reply({ content: "🎰 Usage: /slots character:<name> amount:<coins>", ephemeral: true });
  }
  if (amount <= 0) {
    return interaction.reply({ content: "💸 Amount must be greater than zero!", ephemeral: true });
  }
  const reels = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "💎"];
  const spin = Array.from({ length: 3 }, () => reels[Math.floor(Math.random() * reels.length)]);
  const embed = new EmbedBuilder()
    .setTitle("🎰 Vault Slots")
    .setDescription(`${character} spins for **${amount}** chips. The reels flash: ${spin.join(" | ")}`)
    .setColor(0xfbc02d);
  await interaction.reply({ embeds: [embed] });
}

async function handleGambleCommand(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getNumber("amount");
  if (amount == null) {
    return interaction.reply({ content: "🎲 Usage: /gamble amount:<coins>", ephemeral: true });
  }
  if (amount <= 0) {
    return interaction.reply({ content: "💸 The wager must be positive!", ephemeral: true });
  }
  const outcome = Math.random() < 0.5 ? "wins" : "loses";
  const embed = new EmbedBuilder()
    .setTitle("🎲 Wild Gamble")
    .setDescription(`You toss **${amount}** chips into the Vault... fate decrees you **${outcome}**!`)
    .setColor(outcome === "wins" ? 0x4caf50 : 0xf44336);
  await interaction.reply({ embeds: [embed] });
}

async function handleVaultAccessCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🗝️ Usage: /vaultaccess character:<name>", ephemeral: true });
  }
  const member = await findMember(interaction.guild ?? null, character);
  const status = member ? "The Vault doors part and admit them." : "The guardians find no such patron in the hall.";
  const embed = new EmbedBuilder()
    .setTitle("🗝️ Vault Access")
    .setDescription(`Vault request for **${character}**.\n${status}`)
    .setColor(0x9c27b0);
  await interaction.reply({ embeds: [embed] });
}

async function handleRiftOpenCommand(interaction: ChatInputCommandInteraction) {
  const location = interaction.options.getString("location")?.trim();
  if (!location) {
    return interaction.reply({ content: "🌀 Usage: /riftopen location:<place>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🌀 Rift Opened")
    .setDescription(`A shimmering rift tears open above **${location}**. Echoes pour into the Vault.`)
    .setColor(0x3f51b5);
  await interaction.reply({ embeds: [embed] });
}

async function handleSummonBiomeCommand(interaction: ChatInputCommandInteraction) {
  const biome = interaction.options.getString("biome")?.trim();
  if (!biome) {
    return interaction.reply({ content: "🌍 Usage: /summonbiome biome:<name>", ephemeral: true });
  }
  const climates = ["verdant", "crystalline", "ashen", "luminous", "storm-tossed"];
  const flavor = climates[Math.floor(Math.random() * climates.length)];
  const embed = new EmbedBuilder()
    .setTitle("🌍 Biome Summoned")
    .setDescription(`The Vault manifests a **${biome}** biome, ${flavor} winds swirling through the halls.`)
    .setColor(0x4caf50);
  await interaction.reply({ embeds: [embed] });
}

async function handleDuelCommand(interaction: ChatInputCommandInteraction) {
  const character1 = interaction.options.getString("character1")?.trim();
  const character2 = interaction.options.getString("character2")?.trim();
  if (!character1 || !character2) {
    return interaction.reply({
      content: "⚔️ Usage: /duel character1:<name> character2:<name>",
      ephemeral: true
    });
  }
  const opponent = await findMember(interaction.guild ?? null, character2);
  if (!opponent || opponent.presence?.status === "offline") {
    return interaction.reply({ content: "⚠️ The opponent is not online or doesn’t exist.", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("⚔️ Duel Declared")
    .setDescription(`**${character1}** challenges **${character2}**. The Vault crowds gather to watch!`)
    .setColor(0xe91e63);
  await interaction.reply({ embeds: [embed] });
}

async function handleDivineTrialCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "✨ Usage: /divinetrial character:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("✨ Divine Trial")
    .setDescription(`An astral jury convenes for **${character}**. Their fate hangs in balance.`)
    .setColor(0xff9800);
  await interaction.reply({ embeds: [embed] });
}

async function handleAscendCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🌟 Usage: /ascend character:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🌟 Ascension")
    .setDescription(`**${character}** rises above the casino floor, bathed in vaultlight.`)
    .setColor(0xffeb3b);
  await interaction.reply({ embeds: [embed] });
}

async function handleFactionAlignCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  const faction = interaction.options.getString("faction")?.trim();
  if (!character || !faction) {
    return interaction.reply({
      content: "🛡️ Usage: /factionalign character:<name> faction:<name>",
      ephemeral: true
    });
  }
  const member = await findMember(interaction.guild ?? null, character);
  if (!member) {
    return interaction.reply({ content: "⚠️ That character isn’t present in the casino halls.", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🛡️ Faction Alignment")
    .setDescription(`**${character}** swears allegiance to **${faction}** within the Vault.`)
    .setColor(0x607d8b);
  await interaction.reply({ embeds: [embed] });
}

async function handleBalanceCheckCommand(interaction: ChatInputCommandInteraction) {
  const balanceEmbed = new EmbedBuilder()
    .setTitle("📈 Balance Check")
    .setDescription(`Your purse currently holds **$${money(getBalance(interaction.user.id))}**.`)
    .setColor(0x4db6ac);
  await interaction.reply({ embeds: [balanceEmbed] });
}

async function handleResetBalanceCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🔄 Usage: /resetbalance character:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🔄 Balance Reset Scheduled")
    .setDescription(`A Vault attendant queues a balance reset for **${character}**.`)
    .setColor(0x9e9e9e);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleShowReelsCommand(interaction: ChatInputCommandInteraction) {
  const reels = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "💎"];
  const preview = Array.from({ length: 5 }, () =>
    Array.from({ length: 3 }, () => reels[Math.floor(Math.random() * reels.length)]).join(" | ")
  ).join("\n");
  const embed = new EmbedBuilder()
    .setTitle("🎞️ Vault Reels Preview")
    .setDescription(preview)
    .setColor(0xab47bc);
  await interaction.reply({ embeds: [embed] });
}

async function handleCasinoStartCommand(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🏁 Casino Night Begins")
    .setDescription("Lights flare, dealers bow, and the Vault Casino roars to life!")
    .setColor(0xff5722);
  await interaction.reply({ embeds: [embed] });
}

async function handleLoreDropCommand(interaction: ChatInputCommandInteraction) {
  const topic = interaction.options.getString("topic")?.trim();
  if (!topic) {
    return interaction.reply({ content: "📜 Usage: /loredrop topic:<subject>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("📜 Lore Drop")
    .setDescription(`Ancient whispers about **${topic}** drift through the Vault.`)
    .setColor(0x8d6e63);
  await interaction.reply({ embeds: [embed] });
}

async function handleEchoRevealCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🔍 Usage: /echoreveal character:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🔍 Echo Reveal")
    .setDescription(`Echoes unveil hidden memories of **${character}**.`)
    .setColor(0x3f51b5);
  await interaction.reply({ embeds: [embed] });
}

async function handleProphecyCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🔮 Usage: /prophecy character:<name>", ephemeral: true });
  }
  const omens = ["glory", "peril", "fortune", "betrayal", "ascension"];
  const omen = omens[Math.floor(Math.random() * omens.length)];
  const embed = new EmbedBuilder()
    .setTitle("🔮 Prophecy")
    .setDescription(`A vision shows **${character}** destined for **${omen}**.`)
    .setColor(0x673ab7);
  await interaction.reply({ embeds: [embed] });
}

async function handleRewriteTimelineCommand(interaction: ChatInputCommandInteraction) {
  const eventName = interaction.options.getString("event")?.trim();
  if (!eventName) {
    return interaction.reply({ content: "🕰️ Usage: /rewritetimeline event:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🕰️ Timeline Rewritten")
    .setDescription(`Chronomancers adjust the outcome of **${eventName}**.`)
    .setColor(0x009688);
  await interaction.reply({ embeds: [embed] });
}

async function handleFractureTimelineCommand(interaction: ChatInputCommandInteraction) {
  const eventName = interaction.options.getString("event")?.trim();
  if (!eventName) {
    return interaction.reply({ content: "⏳ Usage: /fracturetimeline event:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("⏳ Timeline Fractured")
    .setDescription(`Shards of destiny split away from **${eventName}**.`)
    .setColor(0x795548);
  await interaction.reply({ embeds: [embed] });
}

async function handleMergeEchoCommand(interaction: ChatInputCommandInteraction) {
  const character1 = interaction.options.getString("character1")?.trim();
  const character2 = interaction.options.getString("character2")?.trim();
  if (!character1 || !character2) {
    return interaction.reply({
      content: "🪞 Usage: /mergeecho character1:<name> character2:<name>",
      ephemeral: true
    });
  }
  const embed = new EmbedBuilder()
    .setTitle("🪞 Echoes Merged")
    .setDescription(`Echoes of **${character1}** and **${character2}** intertwine.`)
    .setColor(0xcddc39);
  await interaction.reply({ embeds: [embed] });
}

async function handleRelicForgeCommand(interaction: ChatInputCommandInteraction) {
  const item = interaction.options.getString("item")?.trim();
  if (!item) {
    return interaction.reply({ content: "⚒️ Usage: /relicforge item:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("⚒️ Relic Forged")
    .setDescription(`A radiant relic named **${item}** is forged upon the Vault anvil.`)
    .setColor(0xff7043);
  await interaction.reply({ embeds: [embed] });
}

async function handleRelicTrackerCommand(interaction: ChatInputCommandInteraction) {
  const item = interaction.options.getString("item")?.trim();
  if (!item) {
    return interaction.reply({ content: "🧭 Usage: /relictracker item:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🧭 Relic Tracker")
    .setDescription(`The trail of **${item}** glows faintly within the Vault archives.`)
    .setColor(0x00acc1);
  await interaction.reply({ embeds: [embed] });
}

async function handleNpcMemoryCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🧠 Usage: /npcmemory character:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🧠 NPC Memory Recovered")
    .setDescription(`Fragments of memory about **${character}** flicker into focus.`)
    .setColor(0xafb42b);
  await interaction.reply({ embeds: [embed] });
}

async function handleSummonCommand(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getString("target")?.trim();
  if (!target) {
    return interaction.reply({ content: "🪄 Usage: /summon target:<faction or npc>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("🪄 Summoning Ritual")
    .setDescription(`The Vault calls upon **${target}**. The air crackles with arrival.`)
    .setColor(0x5c6bc0);
  await interaction.reply({ embeds: [embed] });
}

async function handleRewriteVaultLawCommand(interaction: ChatInputCommandInteraction) {
  const law = interaction.options.getString("law")?.trim();
  if (!law) {
    return interaction.reply({ content: "📘 Usage: /rewritevaultlaw law:<name>", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("📘 Vault Law Rewritten")
    .setDescription(`The decree **${law}** is inscribed anew in the Vault codex.`)
    .setColor(0x2196f3);
  await interaction.reply({ embeds: [embed] });
}

async function handleFactionStatsCommand(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("📊 Faction Statistics")
    .addFields(
      { name: "House Radiant", value: `${Math.floor(Math.random() * 5000)} influence`, inline: true },
      { name: "The Shade", value: `${Math.floor(Math.random() * 5000)} whispers`, inline: true },
      { name: "Clockwork Syndicate", value: `${Math.floor(Math.random() * 5000)} credits`, inline: true }
    )
    .setColor(0x03a9f4);
  await interaction.reply({ embeds: [embed] });
}

async function handleLoreAuditCommand(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🗂️ Lore Audit Initiated")
    .setDescription("Archivists begin cross-referencing every echo and relic. Expect a report soon.")
    .setColor(0x607d8b);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleBalanceOfEveryoneCommand(interaction: ChatInputCommandInteraction) {
  const top = leaderboard(10);
  const description =
    top.length === 0
      ? "No ledgers recorded yet."
      : top.map((row, index) => `**${index + 1}.** <@${row.user_id}> — $${money(row.balance)}`).join("\n");
  const embed = new EmbedBuilder().setTitle("🌐 Balance of Everyone").setDescription(description).setColor(0x26a69a);
  await interaction.reply({ embeds: [embed] });
}

async function handleBanCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "⛔ Usage: /ban character:<name>", ephemeral: true });
  }
  const key = character.toLowerCase();
  if (bannedCharacters.has(key)) {
    return interaction.reply({ content: "⚠️ That character is already barred from the Vault.", ephemeral: true });
  }
  bannedCharacters.add(key);
  const embed = new EmbedBuilder()
    .setTitle("⛔ Vault Ban Issued")
    .setDescription(`**${character}** is barred from the casino floor until further notice.`)
    .setColor(0xd32f2f);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleUndoBanCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "✅ Usage: /undoban character:<name>", ephemeral: true });
  }
  const key = character.toLowerCase();
  if (!bannedCharacters.delete(key)) {
    return interaction.reply({ content: "⚠️ That character was not banned.", ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle("✅ Ban Lifted")
    .setDescription(`**${character}** is welcomed back into the Vault Casino.`)
    .setColor(0x4caf50);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Closing Vault Casino bot.");
  client.destroy();
});

client.login(process.env.BOT_TOKEN);
