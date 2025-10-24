import { promises as fs } from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import OpenAI from "openai";

type ScheduledTask = ReturnType<typeof cron.schedule> | null;

const DAILY_CRON = "5 4 * * *"; // 04:05 UTC each day
const MAX_LOG_BYTES = 8000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const LOG_LOCATIONS = [
  path.resolve("data", "bot.log"),
  path.resolve("data", "error.log"),
  path.resolve("data", "autoUpdates.log"),
  path.resolve("logs", "bot.log")
];

let maintenanceTask: ScheduledTask = null;
let openaiClient: OpenAI | null = null;

export function initializeMaintenanceAI(client: Client) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[MaintenanceAI] OPENAI_API_KEY missing. Skipping maintenance scheduler.");
    return;
  }

  if (maintenanceTask) return;

  openaiClient = new OpenAI({ apiKey });

  maintenanceTask = cron.schedule(
    DAILY_CRON,
    () => {
      runMaintenanceSweep(client).catch(err => console.error("[MaintenanceAI] sweep failed:", err));
    },
    { timezone: "UTC" }
  );

  client.once("ready", () => {
    console.log("[MaintenanceAI] Initial sweep scheduled.");
    runMaintenanceSweep(client).catch(err => console.error("[MaintenanceAI] initial sweep failed:", err));
  });
}

async function runMaintenanceSweep(client: Client) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !openaiClient) return;

  const logs = await collectRecentLogs();
  const logPreview = logs.trim().length > 0 ? logs : "No recent logs were captured in the last 24 hours.";
  const maintenancePrompt = [
    {
      role: "system" as const,
      content:
        "You are a senior QA assistant for a Discord casino bot. Highlight recurring errors and suggest safe fixes. " +
        "Stay concise with bullet lists. Include probable root causes and recommended guardrails."
    },
    {
      role: "user" as const,
      content: `Review the following activity captured over the last 24 hours and produce:\n` +
        "1. A short summary of notable issues\n" +
        "2. Up to three specific bug or misfire diagnoses\n" +
        "3. Optional code-level suggestions (no code execution)\n\n" +
        "Logs:\n```\n" +
        `${logPreview}\n` +
        "```"
    }
  ];

  let analysis = "";
  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: maintenancePrompt,
      max_tokens: 600,
      temperature: 0.6
    });
    analysis = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[MaintenanceAI] OpenAI request failed:", err);
    analysis = "Maintenance AI could not analyze logs due to an API error.";
  }

  await broadcastMaintenanceReport(client, analysis);
}

async function collectRecentLogs() {
  const cutoff = Date.now() - LOOKBACK_MS;
  const chunks: string[] = [];

  for (const candidate of LOG_LOCATIONS) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.mtimeMs < cutoff) continue;
      const data = await readTail(candidate, MAX_LOG_BYTES);
      chunks.push(formatLogChunk(candidate, data));
    } catch {
      // Ignore missing files
    }
  }

  const dynamicDirs = [path.resolve("data"), path.resolve("logs")];
  for (const dir of dynamicDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".log")) continue;
        const fullPath = path.join(dir, entry.name);
        if (LOG_LOCATIONS.includes(fullPath)) continue;
        try {
          const stats = await fs.stat(fullPath);
          if (stats.mtimeMs < cutoff) continue;
          const data = await readTail(fullPath, MAX_LOG_BYTES);
          chunks.push(formatLogChunk(fullPath, data));
        } catch {
          // Ignore file-level issues
        }
      }
    } catch {
      // Directory might not exist
    }
  }

  return chunks.join("\n\n");
}

async function readTail(filePath: string, maxBytes: number) {
  const data = await fs.readFile(filePath, "utf8");
  if (data.length <= maxBytes) return data;
  return data.slice(-maxBytes);
}

function formatLogChunk(filePath: string, data: string) {
  const relative = path.relative(process.cwd(), filePath);
  return `File: ${relative}\n${data}`;
}

async function broadcastMaintenanceReport(client: Client, analysis: string) {
  const channelId = process.env.MAINTENANCE_CHANNEL_ID;
  const summary = analysis.trim() || "No notable issues detected in the last 24 hours.";

  console.log("[MaintenanceAI] Report:", summary);

  if (!channelId) return;
  const channel = await resolveTextChannel(client, channelId);
  if (!channel) {
    console.warn(`[MaintenanceAI] Channel ${channelId} not found or inaccessible.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Maintenance AI Report")
    .setDescription(summary)
    .setColor(0x9c27b0)
    .setTimestamp(new Date());

  await channel.send({ embeds: [embed] }).catch(err => {
    console.error("[MaintenanceAI] Failed to post maintenance report:", err);
  });
}

async function resolveTextChannel(client: Client, channelId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  if (!channel.isTextBased()) return null;
  return channel as TextChannel;
}
