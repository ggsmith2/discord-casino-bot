import cron from "node-cron";
import { ChannelType, Client, EmbedBuilder, Guild, TextChannel } from "discord.js";

type ScheduledTask = ReturnType<typeof cron.schedule> | null;

const EVENT_DURATION_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_HOURS = 2;

const LIMITED_EVENTS = [
  {
    name: "Double XP Hour",
    description: "All patrons bask in vaulted starlight, earning double experience on wins.",
    callToAction: "Challenge an opponent with `/duel` or grind `/slots` for boosted XP."
  },
  {
    name: "Mystery Vault Spins",
    description: "The Vault offers enigmatic spins with surprise relics for daring gamblers.",
    callToAction: "Use `/slots` or `/gamble` to test the Vault's whims."
  },
  {
    name: "Faction Raid Challenge",
    description: "Factions rally! Coordinated strikes yield vault-grade rewards.",
    callToAction: "Align with `/factionalign` and spark raids with `/summon`."
  },
  {
    name: "Relic Jackpot Boost",
    description: "Relic drop odds surge as vault currents destabilize.",
    callToAction: "Drop lore with `/loredrop` or craft relics via `/relicforge`."
  }
];

type ActiveEvent = {
  info: (typeof LIMITED_EVENTS)[number];
  startedAt: number;
  concludeTimer?: NodeJS.Timeout;
};

let schedulerTask: ScheduledTask = null;
let currentEvent: ActiveEvent | null = null;

export function startLimitedEventScheduler(client: Client) {
  const intervalHours = parseIntervalHours(process.env.EVENT_INTERVAL_HOURS);
  const expression = `0 */${intervalHours} * * *`;

  if (schedulerTask) return;

  schedulerTask = cron.schedule(
    expression,
    () => {
      triggerLimitedEvent(client).catch(err =>
        console.error("[LimitedEvents] Failed to start event:", err)
      );
    },
    { timezone: "UTC" }
  );

  client.once("ready", () => {
    console.log(`[LimitedEvents] Scheduler active. Interval: ${intervalHours}h.`);
    triggerLimitedEvent(client).catch(err =>
      console.error("[LimitedEvents] Initial event launch failed:", err)
    );
  });
}

function parseIntervalHours(raw: string | undefined) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_INTERVAL_HOURS;
  return Math.min(Math.max(Math.round(parsed), 1), 12);
}

async function triggerLimitedEvent(client: Client) {
  if (currentEvent) {
    console.log("[LimitedEvents] Existing event active. Skipping new launch.");
    return;
  }
  if (!client.isReady()) return;
  if (client.guilds.cache.size === 0) return;

  const info = LIMITED_EVENTS[Math.floor(Math.random() * LIMITED_EVENTS.length)];
  currentEvent = { info, startedAt: Date.now() };

  console.log(`[LimitedEvents] Launching "${info.name}"`);

  const embed = new EmbedBuilder()
    .setTitle(`Limited-Time Event: ${info.name}`)
    .setDescription(info.description)
    .addFields({ name: "How to Join", value: info.callToAction })
    .setColor(0xff9100)
    .setTimestamp(new Date());

  const targets = await Promise.all(
    client.guilds.cache.map(async guild => {
      const channel = await findBroadcastChannel(guild);
      if (!channel) return null;
      await channel.send({ embeds: [embed] }).catch(err => {
        console.error(`[LimitedEvents] Failed to announce in ${guild.id}:`, err);
      });
      return channel;
    })
  );

  const activeChannels = targets.filter(Boolean) as TextChannel[];
  if (!activeChannels.length) {
    console.warn("[LimitedEvents] No eligible channels found for event broadcast.");
  }

  const conclude = () => concludeEvent(info, activeChannels);
  currentEvent.concludeTimer = setTimeout(conclude, EVENT_DURATION_MS);
  if (typeof currentEvent.concludeTimer.unref === "function") {
    currentEvent.concludeTimer.unref();
  }
}

async function concludeEvent(info: (typeof LIMITED_EVENTS)[number], channels: TextChannel[]) {
  console.log(`[LimitedEvents] Concluding "${info.name}"`);

  const embed = new EmbedBuilder()
    .setTitle(`Event Ended: ${info.name}`)
    .setDescription("The Vault stabilizes. Rewards revert to normal cadence.")
    .setColor(0x546e7a)
    .setTimestamp(new Date());

  await Promise.all(
    channels.map(channel =>
      channel
        .send({ embeds: [embed] })
        .catch(err => console.error(`[LimitedEvents] Failed to send conclusion to ${channel.id}:`, err))
    )
  );

  currentEvent = null;
}

async function findBroadcastChannel(guild: Guild) {
  try {
    await guild.members.fetchMe();
  } catch {
    // Missing permissions
  }

  const me = guild.members.me;
  const channels = guild.channels.cache
    .filter(
      (channel): channel is TextChannel =>
        channel.type === ChannelType.GuildText && (!me || channel.permissionsFor(me)?.has("SendMessages"))
    )
    .sort((a, b) => a.position - b.position);

  const first = channels.first();
  if (first) return first;

  try {
    const fetched = await guild.channels.fetch();
    for (const channel of fetched.values()) {
      if (
        channel &&
        channel.type === ChannelType.GuildText &&
        (!me || channel.permissionsFor(me)?.has("SendMessages"))
      ) {
        return channel as TextChannel;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
