import { promises as fs } from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import OpenAI from "openai";
import { addLore } from "../economy.js";

const AUTO_UPDATE_CRON = "20 5 * * *"; // 05:20 UTC daily
const AUTO_LOG_PATH = path.resolve("data", "autoUpdates.log");
const SYSTEM_USER_ID = "auto-system";

type ScheduledTask = ReturnType<typeof cron.schedule> | null;
type AutoUpdateIdea = {
  title: string;
  description: string;
  hook: string;
  category: "feature" | "lore" | "event";
};

let updateTask: ScheduledTask = null;
let openaiClient: OpenAI | null = null;

export function startAutoUpdateSystem(client: Client) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[AutoUpdate] OPENAI_API_KEY missing. Auto updates disabled.");
    return;
  }

  if (updateTask) return;

  openaiClient = new OpenAI({ apiKey });

  updateTask = cron.schedule(
    AUTO_UPDATE_CRON,
    () => {
      runAutoUpdate(client).catch(err => console.error("[AutoUpdate] daily update failed:", err));
    },
    { timezone: "UTC" }
  );

  client.once("ready", () => {
    runAutoUpdate(client).catch(err => console.error("[AutoUpdate] initial update failed:", err));
  });
}

async function runAutoUpdate(client: Client) {
  if (!openaiClient) return;

  const idea = await generateIdea();
  if (!idea) return;

  addLore(SYSTEM_USER_ID, idea.title, idea.description);
  await appendLog(idea);
  console.log(`[AutoUpdate] Applied ${idea.category} update: ${idea.title}`);

  await broadcastUpdate(client, idea);
}

async function generateIdea(): Promise<AutoUpdateIdea | null> {
  if (!openaiClient) return null;
  const prompt = [
    {
      role: "system" as const,
      content:
        "You maintain a Discord casino RPG. Provide a short, exciting update idea that keeps lore cohesive. " +
        "Respond strictly as compact JSON with keys title, description, hook, category. Category must be one of feature, lore, event."
    },
    {
      role: "user" as const,
      content:
        "Suggest today's \"feature of the day\" or lore vignette that players can experience. " +
        "Keep description under 90 words and hook under 60 characters."
    }
  ];

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: prompt,
      max_tokens: 250,
      temperature: 0.85
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const jsonText = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(jsonText);
    if (!parsed.title || !parsed.description || !parsed.hook) {
      throw new Error("Incomplete idea payload");
    }
    const category =
      parsed.category === "feature" || parsed.category === "event" ? parsed.category : "lore";
    return {
      title: String(parsed.title).slice(0, 80),
      description: String(parsed.description).slice(0, 400),
      hook: String(parsed.hook).slice(0, 60),
      category
    };
  } catch (err) {
    console.error("[AutoUpdate] Failed to generate idea:", err);
    return null;
  }
}

async function appendLog(idea: AutoUpdateIdea) {
  const line = `[${new Date().toISOString()}] (${idea.category}) ${idea.title} :: ${idea.hook}\n`;
  await fs.mkdir(path.dirname(AUTO_LOG_PATH), { recursive: true }).catch(() => {});
  await fs.appendFile(AUTO_LOG_PATH, line, "utf8").catch(err => {
    console.error("[AutoUpdate] Failed to append log:", err);
  });
}

async function broadcastUpdate(client: Client, idea: AutoUpdateIdea) {
  const channelId = process.env.MAINTENANCE_CHANNEL_ID;
  if (!channelId) return;
  const channel = await resolveTextChannel(client, channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`Auto Update: ${idea.title}`)
    .setDescription(idea.description)
    .addFields({ name: "Hook", value: idea.hook })
    .setColor(0x1de9b6)
    .setTimestamp(new Date());

  await channel.send({ embeds: [embed] }).catch(err => {
    console.error("[AutoUpdate] Failed to broadcast update:", err);
  });
}

async function resolveTextChannel(client: Client, channelId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  if (!channel.isTextBased()) return null;
  return channel as TextChannel;
}
