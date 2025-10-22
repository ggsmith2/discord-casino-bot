import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

const token = process.env.BOT_TOKEN!;
const clientId = process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID!;

const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  console.log("Deploying slash commands …");
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log("Commands deployed to guild.");
}

main().catch(console.error);
