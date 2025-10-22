import "dotenv/config";

const clientId = process.env.CLIENT_ID!;
const scopes = encodeURIComponent("bot applications.commands");
// Permissions: Send Messages (2048) + Embed Links (16384) = 18432
const permissions = 2048 + 16384;
const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scopes}`;

console.log("Invite URL:", url);
