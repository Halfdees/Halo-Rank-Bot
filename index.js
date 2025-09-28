// Slash commands (fixed: every option now has a description)
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
