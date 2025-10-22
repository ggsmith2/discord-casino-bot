# Discord Casino Bot — Railway Ready
A Discord.js v14 + TypeScript bot ready for 24/7 hosting on Railway.

## Env Vars
- BOT_TOKEN — your Discord bot token (set on Railway)
- CLIENT_ID — your application ID
- GUILD_ID — your test guild ID (for fast command deploy)

## Local Dev
```sh
npm install
npm run build
npm run deploy   # register slash commands to your guild
npm run invite   # prints invite URL
npm start        # runs the compiled bot
(You may also use npm run dev with ts-node in development.)
```

Deploy on Railway
Push this repo to GitHub (already done).

In Railway: New → GitHub Repo → select this repository.

Set environment variables in Railway (Project → Variables):

BOT_TOKEN = (your real token)

CLIENT_ID = (your app id)

GUILD_ID = (your guild id)

Railway auto-builds and starts the worker with node dist/index.js.

If commands change later, re-run npm run deploy once (locally or via Railway shell).

Optional: CI Deploy via Railway CLI
Add a GitHub secret RAILWAY_TOKEN (from Railway → Account → Tokens). On push to main, the workflow will:

install deps,

build,

and run railway up to deploy.# discord-casino-bot