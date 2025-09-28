// Halo CSR Rank Bot — Nicknames + Roles + CSR fallback
// Node 18+. Deps: discord.js, node-cron, undici

import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import cron from "node-cron";
import { request } from "undici";
import fs from "fs/promises";
import path from "path";

const {
  DISCORD_TOKEN,
  GUILD_ID,
  HALO_ENDPOINT,
  HALO_SHARED_SECRET,
  RANK_PLAYLIST_ID = "edfef3ac-9cbe-4fa2-b949-8f29deafd483",
  ENABLE_NICKNAME_UPDATES = "true",
  CRON_HOURS = "6",
} = process.env;

// CSR fallback ranges
const CSR_RANGES = [
  { role: "Onyx",     min: 1800, max: Infinity },
  { role: "Diamond",  min: 1500, max: 1799 },
  { role: "Platinum", min: 1300, max: 1499 },
  { role: "Gold",     min: 1100, max: 1299 },
  { role: "Silver",   min:  900, max: 1099 },
  { role: "Bronze",   min:    0, max:  899 },
];

// simple storage: discordUserId -> gamertag
const DATA_FILE = path.resolve("./links.json");
const links = new Map();
async function loadLinks() {
  try {
    const txt = await fs.readFile(DATA_FILE, "utf8");
    const obj = JSON.parse(txt);
    for (const [k, v] of Object.entries(obj)) links.set(k, v);
  } catch {}
}
async function saveLinks() {
  const obj = Object.fromEntries(links.entries());
  await fs.writeFile(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// ✅ Fixed slash commands block
const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link YOUR Xbox gamertag")
    .addStringOption(o =>
      o.setName("gamertag")
       .setDescription("Your Xbox gamertag")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("link_other")
    .setDescription("Admin: link someone else's gamertag")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("Discord user to link")
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("gamertag")
       .setDescription("Their Xbox gamertag")
       .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Unlink your gamertag"),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show Ranked Arena CSR for you or someone")
    .addUserOption(o =>
      o.setName("user")
       .setDescription("User to check (optional)")
    ),

  new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Admin: refresh nicknames & roles for all linked users")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  const app = await client.application.fetch(); // auto fetch app ID
  await rest.put(Routes.applicationGuildCommands(app.id, GUILD_ID), { body: commands });
}

async function fetchCSR(gamertag) {
  if (!HALO_ENDPOINT || !HALO_SHARED_SECRET) throw new Error("HALO_ENDPOINT or HALO_SHARED_SECRET missing");
  const url = new URL(HALO_ENDPOINT);
  url.searchParams.set("gt", gamertag);
  url.searchParams.set("playlist", RANK_PLAYLIST_ID);
  const res = await request(url.toString(), { headers: { "x-halo-auth": HALO_SHARED_SECRET } });
  if (res.statusCode >= 400) throw new Error(`Worker responded ${res.statusCode}`);
  const data = await res.body.json(); // { csr, tier }
  return { csr: data?.csr ?? null, tier: data?.tier ?? null };
}

function canonicalTier(label, csr) {
  const L = (label || "").toLowerCase();
  if (L.startsWith("onyx")) return "Onyx";
  if (L.startsWith("diamond")) return "Diamond";
  if (L.startsWith("platinum")) return "Platinum";
  if (L.startsWith("gold")) return "Gold";
  if (L.startsWith("silver")) return "Silver";
  if (L.startsWith("bronze")) return "Bronze";
  if (typeof csr === "number" && Number.isFinite(csr)) {
    const hit = CSR_RANGES.find(r => csr >= r.min && csr <= r.max);
    if (hit) return hit.role;
  }
  return null;
}

async function applyRankDecorations(member, csr, label) {
  const base = member.user.username;
  const csrStr = (typeof csr === "number" && Number.isFinite(csr)) ? String(csr) : "—";
  const newNick = `${csrStr} | ${base}`.slice(0, 32);
  await member.setNickname(newNick).catch(()=>{});

  const roleName = canonicalTier(label, csr);
  const rankRoles = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Onyx"];
  const guildRoles = member.guild.roles.cache;

  for (const rr of rankRoles) {
    const r = guildRoles.find(x => x.name === rr);
    if (r && member.roles.cache.has(r.id) && rr !== roleName) {
      await member.roles.remove(r).catch(()=>{});
    }
  }
  if (roleName) {
    const wanted = guildRoles.find(x => x.name === roleName);
    if (wanted && !member.roles.cache.has(wanted.id)) {
      await member.roles.add(wanted).catch(()=>{});
    }
  }
}

async function refreshAll() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();
  for (const [userId, gt] of links.entries()) {
    const m = members.get(userId);
    if (!m) continue;
    try {
      const { csr, tier } = await fetchCSR(gt);
      if (csr == null && !tier) continue;
      await applyRankDecorations(m, csr, tier);
    } catch {}
  }
}

client.once("ready", async () => {
  await loadLinks();
  try { await registerCommands(); } catch {}
  console.log(`Logged in as ${client.user.tag}`);
  if (ENABLE_NICKNAME_UPDATES === "true") {
    const spec = `0 */${Number(CRON_HOURS)} * * *`;
    cron.schedule(spec, () => { refreshAll().catch(()=>{}); }, { timezone: "UTC" });
    console.log(`Auto-refresh scheduled every ${CRON_HOURS}h`);
  }
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  try {
    if (i.commandName === "link") {
      const gt = i.options.getString("gamertag", true);
      links.set(i.user.id, gt); await saveLinks();
      return i.reply({ content: `Linked **${gt}** to <@${i.user.id}>.`, ephemeral: true });
    }
    if (i.commandName === "link_other") {
      const target
