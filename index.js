import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import fetch from 'undici';
import cron from 'node-cron';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const commands = [
  new SlashCommandBuilder().setName('rank').setDescription('Update your Halo Infinite rank')
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Commands registered');
  } catch (err) {
    console.error(err);
  }
}

async function getCSR(gamertag) {
  const res = await fetch(`${process.env.HALO_ENDPOINT}?gamertag=${encodeURIComponent(gamertag)}`, {
    headers: { 'x-shared-secret': process.env.HALO_SHARED_SECRET }
  });
  if (!res.ok) return null;
  return res.json();
}

function csrToTier(csr) {
  if (csr >= 1800) return 'Onyx';
  if (csr >= 1500) return 'Diamond';
  if (csr >= 1200) return 'Platinum';
  if (csr >= 900) return 'Gold';
  if (csr >= 600) return 'Silver';
  return 'Bronze';
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (process.env.CRON_HOURS) {
    cron.schedule(`0 */${process.env.CRON_HOURS} * * *`, async () => {
      for (const guild of client.guilds.cache.values()) {
        const members = await guild.members.fetch();
        members.forEach(async (member) => {
          const gamertag = member.user.username; // simple placeholder
          const csrData = await getCSR(gamertag);
          if (!csrData) return;
          const tier = csrToTier(csrData.csr);
          const role = guild.roles.cache.find(r => r.name.toLowerCase() === tier.toLowerCase());
          if (role) {
            await member.roles.add(role).catch(() => {});
          }
          if (process.env.ENABLE_NICKNAME_UPDATES === 'true') {
            await member.setNickname(`${gamertag} [${tier} ${csrData.csr}]`).catch(() => {});
          }
        });
      }
    });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'rank') {
    const gamertag = interaction.user.username;
    const csrData = await getCSR(gamertag);
    if (!csrData) return interaction.reply('Could not fetch rank.');
    const tier = csrToTier(csrData.csr);
    const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === tier.toLowerCase());
    if (role) await interaction.member.roles.add(role).catch(() => {});
    if (process.env.ENABLE_NICKNAME_UPDATES === 'true') {
      await interaction.member.setNickname(`${gamertag} [${tier} ${csrData.csr}]`).catch(() => {});
    }
    await interaction.reply(`You are ${tier} ${csrData.csr}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
registerCommands();
