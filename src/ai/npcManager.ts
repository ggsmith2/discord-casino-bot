import cron from "node-cron";
import {
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  Interaction,
  TextChannel
} from "discord.js";
import OpenAI from "openai";
import { registerNpcSystem } from "../ai-npc.js";

type ScheduledTask = ReturnType<typeof cron.schedule> | null;

type NpcDefinition = {
  name: string;
  personality: string;
  faction: string;
};

const NPC_ROSTER: NpcDefinition[] = [
  {
    name: "Dealer Singularity",
    personality: "enigmatic cosmic croupier who speaks in probabilities",
    faction: "Vault Core"
  },
  {
    name: "Vizier Echo",
    personality: "dramatic lorekeeper that references past wagers",
    faction: "Chrono Court"
  },
  {
    name: "Rogue Helix",
    personality: "reckless gambler with a taste for duels and relics",
    faction: "Shadow Syndicate"
  },
  {
    name: "Oracle Lyra",
    personality: "mystic prophet who adores lore drops and faction politics",
    faction: "Aurora Conclave"
  }
];

const COMMAND_REACTIONS = ["duel", "slots", "gamble", "loredrop", "blackjack", "coinflip"];
const AMBIENT_CRON = "*/15 * * * *"; // every 15 minutes
const GUILD_COOLDOWN_MS = 10 * 60 * 1000;

let spawnTask: ScheduledTask = null;
let hooksRegistered = false;
let openaiClient: OpenAI | null = null;
const guildCooldowns = new Map<string, number>();

export function spawnNpcManager(client: Client) {
  registerNpcSystem(client);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[NPCManager] OPENAI_API_KEY missing. Advanced NPC interactions disabled.");
    return;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  if (!hooksRegistered) {
    attachInteractionHooks(client);
    hooksRegistered = true;
  }

  if (!spawnTask) {
    spawnTask = cron.schedule(AMBIENT_CRON, () => {
      orchestrateNpcAppearance(client).catch((err: unknown) =>
        console.error("[NPCManager] Ambient NPC appearance failed:", err)
      );
    });
    client.once("ready", () => {
      orchestrateNpcAppearance(client).catch((err: unknown) =>
        console.error("[NPCManager] Initial NPC appearance failed:", err)
      );
    });
  }
}

function attachInteractionHooks(client: Client) {
  client.on("interactionCreate", interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!COMMAND_REACTIONS.includes(interaction.commandName)) return;
    if (!interaction.channel || !interaction.channel.isTextBased()) return;
    if (!openaiClient) return;

    setTimeout(() => {
      handleCommandReaction(interaction).catch((err: unknown) =>
        console.error("[NPCManager] Command reaction failed:", err)
      );
    }, 1500);
  });
}

async function orchestrateNpcAppearance(client: Client) {
  if (!openaiClient) return;
  if (!client.isReady()) return;

  const eligibleGuilds = client.guilds.cache.filter(guild => isGuildEligible(guild.id));
  if (!eligibleGuilds.size) return;

  const guild = eligibleGuilds.random();
  if (!guild) return;

  const channel = await findNpcChannel(guild);
  if (!channel) {
    guildCooldowns.set(guild.id, Date.now());
    return;
  }

  const npc = NPC_ROSTER[Math.floor(Math.random() * NPC_ROSTER.length)];
  const dialogue = await generateNpcBroadcast(npc);
  if (!dialogue) {
    guildCooldowns.set(guild.id, Date.now());
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${npc.name} Appears`)
    .setDescription(dialogue)
    .addFields(
      { name: "Faction Alignment", value: npc.faction },
      { name: "Signature Challenge", value: "Respond with `/duel`, `/slots`, or `/loredrop`." }
    )
    .setColor(0x673ab7)
    .setFooter({ text: npc.personality });

  await channel.send({ embeds: [embed] }).catch((err: unknown) => {
    console.error("[NPCManager] Failed to send NPC appearance:", err);
  });

  guildCooldowns.set(guild.id, Date.now());
}

async function handleCommandReaction(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;
  if (!openaiClient) return;
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased()) return;
  if (!(typeof (channel as TextChannel).send === "function")) return;
  const targetChannel = channel as TextChannel;

  const npc = NPC_ROSTER[Math.floor(Math.random() * NPC_ROSTER.length)];
  const prompt = [
    {
      role: "system" as const,
      content:
        `You are ${npc.name}, ${npc.personality}. React to a player using the command "${interaction.commandName}". ` +
        "Encourage them with dramatic flair and hint at rival factions. Keep it under 4 short sentences."
    },
    {
      role: "user" as const,
      content: `Player handle: ${interaction.user.username}. Channel type: ${interaction.channel?.type}.`
    }
  ];

  let response = "";
  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: prompt,
      max_tokens: 200,
      temperature: 0.85
    });
    response = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[NPCManager] Command reaction OpenAI error:", err);
    return;
  }

  if (!response) return;

  const embed = new EmbedBuilder()
    .setTitle(`${npc.name} Responds`)
    .setDescription(response)
    .setColor(0x9575cd)
    .setFooter({ text: `${npc.faction} envoy` });

  await targetChannel
    .send({ content: `<@${interaction.user.id}>`, embeds: [embed] })
    .catch((err: unknown) => {
      console.error("[NPCManager] Failed to send command reaction:", err);
    });
}

async function generateNpcBroadcast(npc: NpcDefinition) {
  if (!openaiClient) return "";
  const prompt = [
    {
      role: "system" as const,
      content:
        `You are ${npc.name}, ${npc.personality}. You greet a Discord casino lobby and challenge patrons to duels, slots, or lore.` +
        "Speak in 2-3 sentences. Invite participation using in-universe language."
    },
    {
      role: "user" as const,
      content: "Announce a spontaneous challenge that hints at rewards or faction stakes."
    }
  ];

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: prompt,
      max_tokens: 200,
      temperature: 0.9
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[NPCManager] Broadcast generation failed:", err);
    return "";
  }
}

function isGuildEligible(guildId: string) {
  const last = guildCooldowns.get(guildId) ?? 0;
  return Date.now() - last >= GUILD_COOLDOWN_MS;
}

async function findNpcChannel(guild: Guild) {
  try {
    await guild.members.fetchMe();
  } catch {
    // ignore missing permissions
  }

  const me = guild.members.me;
  const channel =
    guild.channels.cache
      .filter(
        (entry): entry is TextChannel =>
          entry.type === ChannelType.GuildText && (!me || entry.permissionsFor(me)?.has("SendMessages"))
      )
      .sort((a, b) => a.position - b.position)
      .first() ?? null;

  if (channel) return channel;

  try {
    const fetched = await guild.channels.fetch();
    for (const entry of fetched.values()) {
      if (
        entry &&
        entry.type === ChannelType.GuildText &&
        (!me || entry.permissionsFor(me)?.has("SendMessages"))
      ) {
        return entry as TextChannel;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
