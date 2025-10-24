import "dotenv/config";
import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  ComponentType,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionsBitField,
  StringSelectMenuBuilder,
  type Guild,
  type Message
} from "discord.js";
import {
  addBan,
  addItem,
  addLore,
  adjustVault,
  alignFaction,
  canAfford,
  credit,
  debit,
  factionSnapshot,
  currentRules,
  getBalance,
  getInventory,
  getProgress,
  grantDaily,
  grantXp,
  leaderboard,
  loreHistory,
  updateRule,
  removeBan,
  vaultBalance
} from "./economy.js";
import { logDuel } from "./db.js";
import { playBlackjack } from "./games/blackjack.js";
import { playCoinflip } from "./games/coinflip.js";
import { playSlots } from "./games/slots.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const STARTING_CASH = Number(process.env.STARTING_CASH ?? 5000);
const MENU_TIMEOUT = 60_000;
const activeMenus = new Map<string, string>(); // messageId -> userId

function money(n: number) {
  return new Intl.NumberFormat().format(n);
}

const loreSnippets = [
  "The Vault was carved from a comet shard that fell into the heart of Elysian City.",
  "Dealers whisper that the reels spin on echoes of timelines long collapsed.",
  "Beneath the casino floors lies a labyrinth where relics choose their wielders."
];

const prophecyTemplates = [
  "**{character}** will stand at the center of three converging fates.",
  "Fortune crowns **{character}**, yet envy walks one step behind.",
  "When the rift bells toll twice, **{character}** must choose which vault door to seal."
];

const timelineShards = [
  "In this fracture, {event} crowned an entirely different victor.",
  "Echoes show {event} never occurred; the Vault remained silent for a century.",
  "Alternate reels reveal {event} triggered a cascade of luminous storms."
];

const relicRewards = ["Auric Token", "Starlit Die", "Chrono Shard", "Vault Sigil", "Echo Compass"];

const bigWinGifs = [
  "https://media.giphy.com/media/3ohze0Z0P3J2DyYgTm/giphy.gif",
  "https://media.giphy.com/media/l0MYC0LajbaPoEADu/giphy.gif",
  "https://media.giphy.com/media/xT5LMP7Ow0e6Qp5tyg/giphy.gif"
];

type DuelParticipant = {
  id: string | null;
  name: string;
  hp: number;
  guard: boolean;
  isNpc: boolean;
};

type DuelState = {
  id: string;
  player: DuelParticipant;
  opponent: DuelParticipant;
  wager: number;
  pot: number;
  turn: "player" | "opponent";
  resolved: boolean;
};

const duelStates = new Map<string, DuelState>();

function hpBar(hp: number) {
  const total = 10;
  const filled = Math.max(0, Math.round((hp / 100) * total));
  return "#".repeat(filled) + ".".repeat(total - filled);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function duelEmbed(state: DuelState) {
  const embed = new EmbedBuilder()
    .setTitle("⚔️ Vault Duel")
    .setDescription(`Turn: **${state.turn === "player" ? state.player.name : state.opponent.name}**`)
    .addFields(
      {
        name: state.player.name,
        value: `HP: ${state.player.hp}/100\n${hpBar(state.player.hp)}${state.player.guard ? "\n🛡️ Guarded" : ""}`,
        inline: true
      },
      {
        name: state.opponent.name,
        value: `HP: ${state.opponent.hp}/100\n${hpBar(state.opponent.hp)}${state.opponent.guard ? "\n🛡️ Guarded" : ""}`,
        inline: true
      }
    )
    .setFooter({ text: state.wager > 0 ? `Wager pot: $${money(state.pot)}` : "Friendly duel" })
    .setColor(0xe91e63);
  return embed;
}

async function resolveDuel(state: DuelState, message: Message<boolean>) {
  if (state.resolved) return;
  state.resolved = true;

  let winner: DuelParticipant | null = null;
  if (state.player.hp > state.opponent.hp) winner = state.player;
  else if (state.opponent.hp > state.player.hp) winner = state.opponent;

  let description: string;
  if (!winner) {
    description = "The duel ends in a stalemate. The Vault keeps its secrets.";
    if (state.wager > 0 && state.player.id) {
      credit(state.player.id, state.wager);
    }
  } else {
    description = `🏁 **${winner.name}** claims victory!`;
    if (state.wager > 0 && winner.id) {
      credit(winner.id, state.pot * 2);
    }
    if (winner.id) {
      grantXp(winner.id, 60);
    }
    if (state.player.id) grantXp(state.player.id, winner === state.player ? 60 : 25);
    if (state.opponent.id) grantXp(state.opponent.id, winner === state.opponent ? 60 : 25);
    logDuel(state.player.name, state.opponent.name, winner.name, state.wager);
  }

  const embed = duelEmbed(state).setDescription(description);
  await message.edit({ embeds: [embed], components: [] }).catch(() => {});
}

async function executeNpcTurn(
  state: DuelState,
  message: Message<boolean>,
  buttons: ActionRowBuilder<ButtonBuilder>,
  collector: any
) {
  if (state.resolved || state.turn !== "opponent") return;
  const actor = state.opponent;
  const target = state.player;
  const choices: Array<"strike" | "guard" | "focus"> = ["strike", "strike", "guard", "focus"];
  const action = choices[Math.floor(Math.random() * choices.length)];
  let log = "";

  if (action === "strike") {
    const dmg = randomInt(12, 20);
    const finalDmg = target.guard ? Math.max(1, Math.floor(dmg * 0.5)) : dmg;
    target.hp = Math.max(0, target.hp - finalDmg);
    target.guard = false;
    log = `${actor.name} unleashes a shadow strike for ${finalDmg} damage!`;
  } else if (action === "guard") {
    actor.guard = true;
    log = `${actor.name} fortifies their stance.`;
  } else {
    const heal = randomInt(6, 14);
    actor.hp = Math.min(100, actor.hp + heal);
    actor.guard = false;
    log = `${actor.name} channels vaultlight and restores ${heal} vitality.`;
  }

  state.turn = "player";
  await message
    .edit({
      embeds: [duelEmbed(state).setFooter({ text: state.wager > 0 ? `Pot: $${money(state.pot)} • ${log}` : log })],
      components: [buttons]
    })
    .catch(() => {});

  if (target.hp <= 0 || actor.hp <= 0) {
    collector.stop("resolved");
  }
}

async function findMember(guild: Guild | null, name: string) {
  if (!guild) return null;
  const lowered = name.toLowerCase();
  try {
    await guild.members.fetch();
  } catch {
    // Missing privileged intents; fall back to cache.
  }
  const direct = guild.members.cache.get(name);
  if (direct) return direct;
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
  if (!canAfford(interaction.user.id, amount)) {
    return interaction.reply({ content: "⚠️ You do not have enough chips for that spin.", ephemeral: true });
  }

  debit(interaction.user.id, amount);

  const reels = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "💎"];
  const spin = Array.from({ length: 3 }, () => reels[Math.floor(Math.random() * reels.length)]);
  const [a, b, c] = spin;
  let payout = 0;
  if (a === b && b === c) {
    payout = a === "7️⃣" ? amount * 10 : amount * 4;
  } else if (a === b || b === c || a === c) {
    payout = Math.round(amount * 1.5);
  }

  let rewardItem: string | null = null;
  if (payout >= amount * 4) {
    rewardItem = relicRewards[Math.floor(Math.random() * relicRewards.length)];
    addItem(interaction.user.id, rewardItem, 1);
  }

  if (payout > 0) {
    credit(interaction.user.id, payout);
  }

  const progress = grantXp(interaction.user.id, 20);
  const embed = new EmbedBuilder()
    .setTitle("🎰 Vault Slots")
    .setDescription(`${character} spins for **${amount}** chips.\n${spin.join(" | ")}`)
    .addFields(
      { name: "Outcome", value: payout > 0 ? `🎉 Win **$${money(payout)}**` : "💀 The house wins.", inline: true },
      { name: "Balance", value: `$${money(getBalance(interaction.user.id))}`, inline: true },
      { name: "XP", value: `${progress.xp} XP (Level ${progress.level})`, inline: true }
    )
    .setColor(payout > 0 ? 0x4caf50 : 0xf44336);

  if (rewardItem) {
    embed.addFields({ name: "Relic Bonus", value: `You discovered **${rewardItem}**!` });
    embed.setImage(bigWinGifs[Math.floor(Math.random() * bigWinGifs.length)]);
  }

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
  if (!canAfford(interaction.user.id, amount)) {
    return interaction.reply({ content: "⚠️ You cannot wager more than you carry.", ephemeral: true });
  }

  debit(interaction.user.id, amount);
  const outcome = Math.random() < 0.5 ? "wins" : "loses";
  if (outcome === "wins") {
    credit(interaction.user.id, amount * 2);
  }

  const progress = grantXp(interaction.user.id, 10);
  const embed = new EmbedBuilder()
    .setTitle("🎲 Wild Gamble")
    .setDescription(`You toss **${amount}** chips into the Vault... fate decrees you **${outcome.toUpperCase()}**!`)
    .addFields(
      { name: "Balance", value: `$${money(getBalance(interaction.user.id))}`, inline: true },
      { name: "XP", value: `${progress.xp} XP (Level ${progress.level})`, inline: true }
    )
    .setColor(outcome === "wins" ? 0x4caf50 : 0xf44336);
  await interaction.reply({ embeds: [embed] });
}

async function handleVaultAccessCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  const action = interaction.options.getString("action", true);
  const amount = interaction.options.getNumber("amount", true);
  if (!character) {
    return interaction.reply({ content: "🗝️ Character name is required.", ephemeral: true });
  }
  if (amount <= 0) {
    return interaction.reply({ content: "⚖️ Amount must be greater than zero.", ephemeral: true });
  }

  let vaultBalanceAfter = vaultBalance();
  if (action === "deposit") {
    if (!canAfford(interaction.user.id, amount)) {
      return interaction.reply({ content: "⚠️ You cannot deposit more than you have.", ephemeral: true });
    }
    debit(interaction.user.id, amount);
    vaultBalanceAfter = adjustVault(amount);
  } else if (action === "withdraw") {
    const current = vaultBalance();
    if (current < amount) {
      return interaction.reply({ content: "⚠️ The shared Vault does not hold that many chips.", ephemeral: true });
    }
    vaultBalanceAfter = adjustVault(-amount);
    credit(interaction.user.id, amount);
  }

  grantXp(interaction.user.id, 8);
  const embed = new EmbedBuilder()
    .setTitle("🏦 Vault Access")
    .setDescription(
      `**${character}** ${action === "deposit" ? "deposits" : "withdraws"} **$${money(amount)}** into the shared Vault.`
    )
    .addFields(
      { name: "Vault Balance", value: `$${money(vaultBalanceAfter)}`, inline: true },
      { name: "Your Balance", value: `$${money(getBalance(interaction.user.id))}`, inline: true }
    )
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
  const wager = Math.max(0, Math.floor(interaction.options.getNumber("wager") ?? 0));
  if (!character1 || !character2) {
    return interaction.reply({
      content: "⚔️ Usage: /duel character1:<name> character2:<name> [wager]",
      ephemeral: true
    });
  }

  const opponentMember = await findMember(interaction.guild ?? null, character2);

  if (wager > 0) {
    if (!canAfford(interaction.user.id, wager)) {
      return interaction.reply({ content: "⚠️ You cannot wager more than you hold.", ephemeral: true });
    }
    debit(interaction.user.id, wager);
  }

  const duelId = `${interaction.id}`;
  const state: DuelState = {
    id: duelId,
    player: { id: interaction.user.id, name: character1, hp: 100, guard: false, isNpc: false },
    opponent: {
      id: opponentMember?.user.id ?? null,
      name: opponentMember ? opponentMember.displayName : character2,
      hp: 100,
      guard: false,
      isNpc: !opponentMember
    },
    wager,
    pot: wager,
    turn: "player",
    resolved: false
  };
  duelStates.set(duelId, state);

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${duelId}:strike`).setLabel("Strike").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${duelId}:guard`).setLabel("Guard").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${duelId}:focus`).setLabel("Channel Fate").setStyle(ButtonStyle.Secondary)
  );

  const message = await interaction.reply({
    embeds: [duelEmbed(state)],
    components: [buttons],
    fetchReply: true
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000
  });

  const allowedIds = new Set<string>();
  allowedIds.add(interaction.user.id);
  if (state.opponent.id) allowedIds.add(state.opponent.id);

  collector.on("collect", async i => {
    if (!allowedIds.has(i.user.id)) {
      await i.reply({ content: "This duel does not involve you.", ephemeral: true });
      return;
    }
    const current = state.turn === "player" ? state.player : state.opponent;
    if (current.id && current.id !== i.user.id) {
      await i.reply({ content: "Please wait for your turn.", ephemeral: true });
      return;
    }

    let opponent = state.turn === "player" ? state.opponent : state.player;

    const action = i.customId.split(":")[1];
    let log = "";
    if (action === "strike") {
      const dmg = randomInt(14, 24);
      const finalDmg = opponent.guard ? Math.max(1, Math.floor(dmg * 0.5)) : dmg;
      opponent.hp = Math.max(0, opponent.hp - finalDmg);
      opponent.guard = false;
      log = `${current.name} strikes for ${finalDmg} damage!`;
    } else if (action === "guard") {
      current.guard = true;
      log = `${current.name} braces for impact.`;
    } else if (action === "focus") {
      const heal = randomInt(8, 16);
      current.hp = Math.min(100, current.hp + heal);
      current.guard = false;
      log = `${current.name} channels fate and restores ${heal} vitality.`;
    }

    state.turn = state.turn === "player" ? "opponent" : "player";

    await i.update({
      embeds: [duelEmbed(state).setFooter({ text: state.wager > 0 ? `Pot: $${money(state.pot)} • ${log}` : log })],
      components: [buttons]
    });

    if (opponent.hp <= 0 || current.hp <= 0) {
      collector.stop("resolved");
    } else if (state.turn === "opponent" && state.opponent.isNpc) {
      setTimeout(() => executeNpcTurn(state, message, buttons, collector), 1200);
    }
  });

  collector.on("end", async () => {
    await resolveDuel(state, message);
  });
}

async function handleDivineTrialCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "✨ Usage: /divinetrial character:<name>", ephemeral: true });
  }
  const success = Math.random() < 0.6;
  const reward = success ? randomInt(150, 400) : Math.min(getBalance(interaction.user.id), randomInt(50, 150));
  let description: string;
  if (success) {
    credit(interaction.user.id, reward);
    grantXp(interaction.user.id, 35);
    description = `The astral jury smiles upon **${character}**. You earn **$${money(reward)}** in radiant tithes.`;
    addLore(interaction.user.id, `Divine Trial: ${character}`, "The jury etched your name among the Vault's chosen.");
  } else {
    if (reward > 0) debit(interaction.user.id, reward);
    description = `The trial weighs heavily on **${character}**. The Vault demands **$${money(reward)}** in penance.`;
  }
  const embed = new EmbedBuilder()
    .setTitle("✨ Divine Trial")
    .setDescription(description)
    .addFields(
      { name: "Balance", value: `$${money(getBalance(interaction.user.id))}`, inline: true },
      { name: "XP", value: `${getProgress(interaction.user.id).xp} XP`, inline: true }
    )
    .setColor(success ? 0xff9800 : 0x9e9e9e);
  await interaction.reply({ embeds: [embed] });
}

async function handleAscendCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🌟 Usage: /ascend character:<name>", ephemeral: true });
  }
  const progress = getProgress(interaction.user.id);
  if (progress.level < 3) {
    return interaction.reply({
      content: "🌟 You must reach at least level 3 before attempting ascension.",
      ephemeral: true
    });
  }
  const bonus = randomInt(300, 600);
  credit(interaction.user.id, bonus);
  const rewardItem = relicRewards[Math.floor(Math.random() * relicRewards.length)];
  addItem(interaction.user.id, rewardItem, 1);
  grantXp(interaction.user.id, 50);

  const embed = new EmbedBuilder()
    .setTitle("🌟 Ascension")
    .setDescription(
      `**${character}** rises above the casino floor in a column of light!\nYou gain **$${money(
        bonus
      )}** and discover **${rewardItem}**.`
    )
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
  alignFaction(interaction.user.id, faction);
  grantXp(interaction.user.id, 20);
  const stats = factionSnapshot()
    .map(entry => `• **${entry.faction}** — ${entry.members} members`)
    .join("\n");
  const embed = new EmbedBuilder()
    .setTitle("🛡️ Faction Alignment")
    .setDescription(`**${character}** swears allegiance to **${faction}**.`)
    .addFields({ name: "Faction Influence", value: stats || "No factions registered yet." })
    .setColor(0x607d8b);
  await interaction.reply({ embeds: [embed] });
}

async function handleBalanceCheckCommand(interaction: ChatInputCommandInteraction) {
  const balance = getBalance(interaction.user.id);
  const progress = getProgress(interaction.user.id);
  const inventory = getInventory(interaction.user.id)
    .map(entry => `• ${entry.item} ×${entry.quantity}`)
    .join("\n");
  const recentLore = loreHistory(interaction.user.id)
    .map(entry => `• ${entry.topic}`)
    .join("\n");
  const embed = new EmbedBuilder()
    .setTitle("📈 Vault Ledger")
    .addFields(
      { name: "Balance", value: `$${money(balance)}`, inline: true },
      { name: "Level", value: `Lvl ${progress.level} — ${progress.xp} XP`, inline: true }
    )
    .setColor(0x4db6ac);
  embed.addFields({
    name: "Inventory",
    value: inventory || "Empty pockets. The Vault awaits your triumphs."
  });
  if (recentLore) {
    embed.addFields({ name: "Lore Discoveries", value: recentLore });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleResetBalanceCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🔄 Usage: /resetbalance character:<name>", ephemeral: true });
  }
  const member = await findMember(interaction.guild ?? null, character);
  if (!member) {
    return interaction.reply({ content: "⚠️ Unable to locate that patron in the guild.", ephemeral: true });
  }
  const caller = await interaction.guild?.members.fetch(interaction.user.id);
  const canManage = caller?.permissions.has(PermissionsBitField.Flags.ManageGuild);
  if (!canManage) {
    return interaction.reply({ content: "🔒 You need Manage Server to reset balances.", ephemeral: true });
  }

  const targetBalance = STARTING_CASH;
  const current = getBalance(member.id);
  if (current > targetBalance) {
    debit(member.id, current - targetBalance);
  } else if (current < targetBalance) {
    credit(member.id, targetBalance - current);
  }

  const embed = new EmbedBuilder()
    .setTitle("🔄 Balance Reset")
    .setDescription(`**${member.displayName}** has been returned to the starting balance of **$${money(targetBalance)}**.`)
    .setColor(0x9e9e9e);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleShowReelsCommand(interaction: ChatInputCommandInteraction) {
  const reels = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "💎"];
  const preview = Array.from({ length: 4 }, () =>
    Array.from({ length: 3 }, () => reels[Math.floor(Math.random() * reels.length)]).join(" | ")
  ).join("\n");
  const embed = new EmbedBuilder()
    .setTitle("🎞️ Vault Reels Preview")
    .setDescription(preview)
    .setFooter({ text: "These reels are drawn from dormant timelines." })
    .setColor(0xab47bc);
  await interaction.reply({ embeds: [embed] });
}

async function handleCasinoStartCommand(interaction: ChatInputCommandInteraction) {
  const bonus = randomInt(200, 400);
  adjustVault(bonus);
  const embed = new EmbedBuilder()
    .setTitle("🏁 Casino Night Begins")
    .setDescription("Lights flare, dealers bow, and the Vault Casino roars to life!")
    .addFields({ name: "House Bonus", value: `The Vault adds **$${money(bonus)}** to the shared pool.` })
    .setColor(0xff5722);
  await interaction.reply({ embeds: [embed] });
}

async function handleLoreDropCommand(interaction: ChatInputCommandInteraction) {
  const topic = interaction.options.getString("topic")?.trim();
  if (!topic) {
    return interaction.reply({ content: "📜 Usage: /loredrop topic:<subject>", ephemeral: true });
  }
  const snippet = loreSnippets[Math.floor(Math.random() * loreSnippets.length)];
  addLore(interaction.user.id, topic, snippet);
  grantXp(interaction.user.id, 15);
  const embed = new EmbedBuilder()
    .setTitle("📜 Lore Drop")
    .setDescription(`**${topic}** — ${snippet}`)
    .setColor(0x8d6e63);
  await interaction.reply({ embeds: [embed] });
}

async function handleEchoRevealCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🔍 Usage: /echoreveal character:<name>", ephemeral: true });
  }
  const memories = loreHistory(interaction.user.id).slice(0, 3);
  const embed = new EmbedBuilder()
    .setTitle("🔍 Echo Reveal")
    .setDescription(`Echoes unveil hidden memories of **${character}**.`)
    .setColor(0x3f51b5);
  if (memories.length > 0) {
    embed.addFields({
      name: "Recent Echoes",
      value: memories.map(entry => `• ${entry.topic}`).join("\n")
    });
  }
  await interaction.reply({ embeds: [embed] });
}

async function handleProphecyCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🔮 Usage: /prophecy character:<name>", ephemeral: true });
  }
  const template = prophecyTemplates[Math.floor(Math.random() * prophecyTemplates.length)];
  const text = template.replace("{character}", character);
  addLore(interaction.user.id, `Prophecy of ${character}`, text);
  grantXp(interaction.user.id, 25);
  const embed = new EmbedBuilder().setTitle("🔮 Prophecy").setDescription(text).setColor(0x673ab7);
  await interaction.reply({ embeds: [embed] });
}

async function handleRewriteTimelineCommand(interaction: ChatInputCommandInteraction) {
  const eventName = interaction.options.getString("event")?.trim();
  if (!eventName) {
    return interaction.reply({ content: "🕰️ Usage: /rewritetimeline event:<name>", ephemeral: true });
  }
  const shard = timelineShards[Math.floor(Math.random() * timelineShards.length)].replace("{event}", eventName);
  addLore(interaction.user.id, `Rewritten ${eventName}`, shard);
  const embed = new EmbedBuilder().setTitle("🕰️ Timeline Rewritten").setDescription(shard).setColor(0x009688);
  await interaction.reply({ embeds: [embed] });
}

async function handleFractureTimelineCommand(interaction: ChatInputCommandInteraction) {
  const eventName = interaction.options.getString("event")?.trim();
  if (!eventName) {
    return interaction.reply({ content: "⏳ Usage: /fracturetimeline event:<name>", ephemeral: true });
  }
  const shard = timelineShards[Math.floor(Math.random() * timelineShards.length)].replace("{event}", eventName);
  addLore(interaction.user.id, `Fractured ${eventName}`, shard);
  const embed = new EmbedBuilder().setTitle("⏳ Timeline Fractured").setDescription(shard).setColor(0x795548);
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
  const narrative = `${character1} and ${character2} entwine their destinies, sharing relics and memories.`;
  addLore(interaction.user.id, `Merge: ${character1}+${character2}`, narrative);
  grantXp(interaction.user.id, 30);
  const embed = new EmbedBuilder().setTitle("🪞 Echoes Merged").setDescription(narrative).setColor(0xcddc39);
  await interaction.reply({ embeds: [embed] });
}

async function handleRelicForgeCommand(interaction: ChatInputCommandInteraction) {
  const item = interaction.options.getString("item")?.trim();
  if (!item) {
    return interaction.reply({ content: "⚒️ Usage: /relicforge item:<name>", ephemeral: true });
  }
  addItem(interaction.user.id, item, 1);
  grantXp(interaction.user.id, 20);
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
  const inventory = getInventory(interaction.user.id);
  const owned = inventory.find(entry => entry.item.toLowerCase() === item.toLowerCase());
  const embed = new EmbedBuilder()
    .setTitle("🧭 Relic Tracker")
    .setDescription(
      owned
        ? `The trail of **${item}** glows brightly — you carry **${owned.quantity}** piece(s).`
        : `No current trace of **${item}** in your satchel.`
    )
    .setColor(0x00acc1);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleNpcMemoryCommand(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString("character")?.trim();
  if (!character) {
    return interaction.reply({ content: "🧠 Usage: /npcmemory character:<name>", ephemeral: true });
  }
  const memory = `${character} once wagered their shadow and won, but the shadow kept visiting the Vault anyway.`;
  addLore(interaction.user.id, `NPC Memory: ${character}`, memory);
  const embed = new EmbedBuilder()
    .setTitle("🧠 NPC Memory Recovered")
    .setDescription(memory)
    .setColor(0xafb42b);
  await interaction.reply({ embeds: [embed] });
}

async function handleSummonCommand(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getString("target")?.trim();
  if (!target) {
    return interaction.reply({ content: "🪄 Usage: /summon target:<faction or npc>", ephemeral: true });
  }
  grantXp(interaction.user.id, 10);
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
  updateRule("global-law", law);
  const rules = currentRules()
    .map(rule => `• ${rule.key}: ${rule.value}`)
    .join("\n");
  const embed = new EmbedBuilder()
    .setTitle("📘 Vault Law Rewritten")
    .setDescription(`The decree **${law}** is inscribed anew in the Vault codex.`)
    .addFields({ name: "Active Laws", value: rules || "No standing laws. Chaos reigns." })
    .setColor(0x2196f3);
  await interaction.reply({ embeds: [embed] });
}

async function handleFactionStatsCommand(interaction: ChatInputCommandInteraction) {
  const stats = factionSnapshot();
  const embed = new EmbedBuilder()
    .setTitle("📊 Faction Statistics")
    .setDescription(
      stats.length > 0
        ? stats.map(entry => `• **${entry.faction}** — ${entry.members} members`).join("\n")
        : "No factions have declared allegiance yet."
    )
    .setColor(0x03a9f4);
  await interaction.reply({ embeds: [embed] });
}

async function handleLoreAuditCommand(interaction: ChatInputCommandInteraction) {
  const discoveries = loreHistory(interaction.user.id);
  const embed = new EmbedBuilder()
    .setTitle("🗂️ Lore Audit Initiated")
    .setDescription("Archivists begin cross-referencing every echo and relic. Expect a report soon.")
    .addFields({ name: "Entries Reviewed", value: `${discoveries.length}` })
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
  addBan(interaction.user.id, character);
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
  removeBan(interaction.user.id, character);
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






