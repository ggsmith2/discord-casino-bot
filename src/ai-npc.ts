import {
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  Message,
  TextChannel
} from "discord.js";
import OpenAI from "openai";
import { buildSnapshot, npcSettings } from "./economy.js";

type MemoryEntry = { role: "user" | "assistant"; content: string };

const userMemories = new Map<string, MemoryEntry[]>();
const userCooldowns = new Map<string, number>();
const guildAmbientCooldowns = new Map<string, number>();
const NPC_COLOR = 0x7c4dff;
const AMBIENT_INTERVAL_MS = 5 * 60 * 1000;

export function registerNpcSystem(client: Client) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[Vault NPC] OPENAI_API_KEY not set. AI NPC disabled.");
    return;
  }

  const openai = new OpenAI({ apiKey });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild || message.content.trim().length === 0) return;
    const guildId = message.guild.id;
    const settings = npcSettings(guildId);
    if (!settings.enabled) return;

    const key = `${guildId}:${message.author.id}`;
    const now = Date.now();
    const cooldownMs = Math.max(15, settings.cooldown ?? 45) * 1000;
    const last = userCooldowns.get(key) ?? 0;

    const mentionedVault = message.mentions.users.has(client.user!.id ?? "");
    const keywordMatch = /vault|casino|dealer|npc|oracle/i.test(message.content);
    const randomChance = Math.random() < 0.12;
    const shouldRespond = mentionedVault || keywordMatch || randomChance;

    if (!shouldRespond || now - last < cooldownMs) return;
    userCooldowns.set(key, now);

    try {
      const snapshot = buildSnapshot(message.author.id);
      const statsSummary = [
        `Balance: $${snapshot.wallet.balance}`,
        `Level: ${snapshot.wallet.level} (${snapshot.wallet.xp} XP)`,
        `Faction: ${snapshot.faction ?? "Unaligned"}`,
        `Relics: ${snapshot.inventory.length ? snapshot.inventory.map(item => `${item.item}Ã—${item.quantity}`).slice(0, 5).join(", ") : "None"}`
      ].join(" | ");

      const history = userMemories.get(key) ?? [];
      const chatHistory = [
        ...history,
        { role: "user" as const, content: `${message.content}\n\nPlayer Stats: ${statsSummary}` }
      ];

      const systemPrompt =
        "You are \"The Vault\", an enigmatic AI NPC that inhabits a cosmic casino Discord server. " +
        "Speak in a mysterious, flirtatious casino tone. Reference player stats when helpful and invite them to use bot commands. " +
        "Keep responses under 120 words. Provide diegetic guidance instead of raw command syntax when possible.";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
        max_tokens: 220,
        temperature: 0.9
      });

      const reply = completion.choices[0]?.message?.content?.trim();
      if (!reply) return;

      const updatedHistory = [
        ...history,
        { role: "user" as const, content: message.content },
        { role: "assistant" as const, content: reply }
      ].slice(-10);
      userMemories.set(key, updatedHistory);

      const suggestions: string[] = [];
      if (snapshot.wallet.balance < 500) suggestions.push("/daily");
      if (!snapshot.inventory.length) suggestions.push("/slots");
      if (!snapshot.faction) suggestions.push("/factionalign");

      const embed = new EmbedBuilder()
        .setTitle("ðŸ¤– The Vault")
        .setDescription(reply)
        .setColor(NPC_COLOR)
        .setFooter({ text: "AI NPC â€¢ Vault whispers" });

      if (suggestions.length) {
        embed.addFields({ name: "Suggested Command", value: suggestions.join(", ") });
      }

      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[Vault NPC] Failed to generate response:", err);
    }
  });

  const interval = setInterval(() => {
    triggerAmbientEvent(client, openai).catch((err) =>
      console.error("[Vault NPC] Ambient event failed:", err)
    );
  }, AMBIENT_INTERVAL_MS);

  if (typeof interval.unref === "function") interval.unref();
}

async function triggerAmbientEvent(client: Client, openai: OpenAI) {
  if (client.guilds.cache.size === 0) return;
  const guilds = client.guilds.cache.filter((guild) => npcSettings(guild.id).enabled);
  if (!guilds.size) return;

  const guild = guilds.random();
  if (!guild) return;

  const settings = npcSettings(guild.id);
  const last = guildAmbientCooldowns.get(guild.id) ?? 0;
  const cooldownMs = Math.max(30, settings.cooldown ?? 45) * 1000 * 3;
  if (Date.now() - last < cooldownMs) return;

  const channel = findTextChannel(guild);
  if (!channel) return;

  guildAmbientCooldowns.set(guild.id, Date.now());

  try {
    const members = await guild.members.fetch();
    const candidates = members.filter((m) => !m.user.bot);
    const targetMember = candidates.random();
    const snapshot = targetMember ? buildSnapshot(targetMember.id) : null;

    const statsSummary = snapshot
      ? `Credits $${snapshot.wallet.balance}, Level ${snapshot.wallet.level}, Relics ${snapshot.inventory.length}`
      : "Mysterious patron data unavailable.";

    const prompt =
      "You are \"The Vault\", the AI host of a cosmic casino Discord server. " +
      "Compose a short (max 3 sentences) broadcast announcing a spontaneous vault event. " +
      "If a target player is provided, tease them directly. " +
      "Encourage patrons to try a fitting command like /duel, /gamble, or /loredrop.";

    const userMessage = targetMember
      ? `Target Player: ${targetMember.displayName}\nStats: ${statsSummary}`
      : "No specific target provided.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userMessage }
      ],
      max_tokens: 200,
      temperature: 1.0
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return;

    const suggested =
      Math.random() < 0.5
        ? "/duel"
        : Math.random() < 0.5
          ? "/gamble"
          : "/loredrop";

    const embed = new EmbedBuilder()
      .setTitle("ðŸŒŒ Vault Whisper")
      .setDescription(text)
      .setColor(NPC_COLOR)
      .setFooter({ text: `Suggested action: ${suggested}` });

    await channel.send({ content: targetMember ? `<@${targetMember.id}>` : undefined, embeds: [embed] });
  } catch (err) {
    console.error("[Vault NPC] Ambient OpenAI error:", err);
  }
}

function findTextChannel(guild: Guild): TextChannel | null {
  const me = guild.members.me;
  const channels = guild.channels.cache
    .filter(
      (channel): channel is TextChannel =>
        channel.type === ChannelType.GuildText &&
        (!me || channel.permissionsFor(me)?.has("SendMessages"))
    )
    .sort((a, b) => a.position - b.position);
  return channels.first() ?? null;
}
