require("dotenv").config();

const express = require("express");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
} = require("discord.js");

const requiredEnv = [
  "DISCORD_TOKEN",
  "GUILD_ID",
  "APPLICATION_CHANNEL_ID",
  "ACCEPTED_CHANNEL_ID",
  "AFL_ROLE_ID"
];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing .env values: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill in your Discord bot token.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const questions = [
  ["City name and city ID", "cityNameId"],
  ["Discord ID", "discordId"],
  ["Age and date of birth", "ageDob"],
  ["Discord name - Discord ID", "discordNameId"],
  ["Availability (morning, midday, evening, late night)", "availability"],
  ["Why should we accept you into AFL?", "whyAccept"],
  ["What are your goals within AFL?", "goals"],
  ["What expectations do you have while being part of AFL?", "expectations"],
  ["What would you do if a client says no to your sales?", "salesNo"],
  ["Give us 5 examples of perm abuse", "permAbuse"],
  ["Why is it mandatory to be in your team VC?", "teamVc"],
  ["Do you understand that being unprofessional, rude, or not following city/AFL rules can result in removal or strikes?", "rules"]
];

function safeText(value, max = 1024) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : (text || "Not provided");
}

function buildApplicationEmbed(data) {
  const embed = new EmbedBuilder()
    .setColor(0xC9A227)
    .setTitle("👑 Crown RP | AFL Application")
    .setDescription("A new AFL application has been submitted. Review the answers below.")
    .setFooter({ text: "Crown RP • AFL Recruitment" })
    .setTimestamp();

  for (const [label, key] of questions) {
    embed.addFields({ name: label, value: safeText(data[key]), inline: false });
  }
  embed.addFields({
    name: "Applicant Discord ID (used for role assignment)",
    value: safeText(data.discordId, 100),
    inline: false
  });
  return embed;
}

function reviewButtons(applicationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`afl_accept:${applicationId}`)
      .setLabel("Accept")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`afl_deny:${applicationId}`)
      .setLabel("Deny")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/applications", async (req, res) => {
  try {
    if (!client.isReady()) {
      return res.status(503).json({ error: "The Discord bot is not ready yet. Try again in a moment." });
    }

    const data = req.body || {};
    const missingAnswers = questions.filter(([, key]) => !String(data[key] ?? "").trim());
    if (missingAnswers.length) {
      return res.status(400).json({ error: "Please answer every required question." });
    }

    const discordId = String(data.discordId).trim();
    if (!/^\d{17,20}$/.test(discordId)) {
      return res.status(400).json({ error: "Enter a valid Discord User ID (17–20 digits)." });
    }

    const channel = await client.channels.fetch(process.env.APPLICATION_CHANNEL_ID);
    if (!channel || !channel.isTextBased() || !channel.send) {
      return res.status(500).json({ error: "The application channel could not be accessed. Check the channel ID and bot permissions." });
    }

    const applicationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = await channel.send({
      embeds: [buildApplicationEmbed(data)],
      components: [reviewButtons(applicationId)]
    });

    res.status(201).json({ ok: true, applicationId, messageId: message.id });
  } catch (error) {
    console.error("Application submission error:", error);
    res.status(500).json({ error: "Could not submit the application. Check the server console and bot permissions." });
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const [action, applicationId] = interaction.customId.split(":");
  if (!["afl_accept", "afl_deny"].includes(action)) return;

  // Restrict reviews to members who can manage the server. Change this policy if needed.
  if (!interaction.memberPermissions?.has("ManageGuild")) {
    return interaction.reply({
      content: "You need the Manage Server permission to review AFL applications.",
      ephemeral: true
    });
  }

  const originalEmbed = interaction.message.embeds[0];
  if (!originalEmbed) {
    return interaction.reply({ content: "This application embed could not be read.", ephemeral: true });
  }

  if (action === "afl_deny") {
    const deniedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0xD64545)
      .setTitle("❌ Crown RP | AFL Application — Denied")
      .addFields({ name: "Decision", value: `Denied by ${interaction.user.tag}`, inline: false })
      .setTimestamp();
    await interaction.update({ embeds: [deniedEmbed], components: [] });
    return;
  }

  try {
    const discordIdField = originalEmbed.fields?.find((field) =>
      field.name.includes("Applicant Discord ID")
    );
    const applicantId = discordIdField?.value?.match(/\d{17,20}/)?.[0];
    if (!applicantId) {
      return interaction.reply({
        content: "Couldn't find a valid applicant Discord ID in this application.",
        ephemeral: true
      });
    }

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(applicantId).catch(() => null);
    if (!member) {
      return interaction.reply({
        content: "Applicant isn't in the Crown RP server, so I couldn't assign the AFL role. Ask them to join and try again.",
        ephemeral: true
      });
    }

    const role = await guild.roles.fetch(process.env.AFL_ROLE_ID);
    if (!role) {
      return interaction.reply({ content: "The AFL role ID was not found. Check AFL_ROLE_ID in .env.", ephemeral: true });
    }

    await member.roles.add(role, `AFL application accepted by ${interaction.user.tag}`);

    const acceptedChannel = await client.channels.fetch(process.env.ACCEPTED_CHANNEL_ID);
    if (!acceptedChannel || !acceptedChannel.isTextBased() || !acceptedChannel.send) {
      return interaction.reply({
        content: "The role was assigned, but the accepted-applications channel could not be accessed. Check the channel ID and bot permissions.",
        ephemeral: true
      });
    }

    const acceptedEmbed = new EmbedBuilder()
      .setColor(0x35B56A)
      .setTitle("✅ Crown RP | AFL Application Accepted")
      .setDescription(`<@${applicantId}> has been accepted into AFL!`)
      .addFields(
        { name: "Applicant", value: `<@${applicantId}>`, inline: true },
        { name: "Reviewed by", value: `${interaction.user}`, inline: true },
        { name: "Role assigned", value: `<@&${role.id}>`, inline: true }
      )
      .setFooter({ text: "Crown RP • AFL Recruitment" })
      .setTimestamp();

    await acceptedChannel.send({ content: `<@${applicantId}>`, embeds: [acceptedEmbed] });

    const acceptedOriginal = EmbedBuilder.from(originalEmbed)
      .setColor(0x35B56A)
      .setTitle("✅ Crown RP | AFL Application — Accepted")
      .addFields({ name: "Decision", value: `Accepted by ${interaction.user.tag} • Role assigned: ${role.name}`, inline: false })
      .setTimestamp();

    await interaction.update({ embeds: [acceptedOriginal], components: [] });
  } catch (error) {
    console.error("Application review error:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "Something went wrong while processing this decision. Check the bot console.", ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: "Something went wrong while processing this decision. Check the bot console.", ephemeral: true }).catch(() => {});
    }
  }
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Crown RP AFL bot logged in as ${readyClient.user.tag}`);
  console.log(`Website server listening on port ${process.env.PORT || 3000}`);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Website running at http://localhost:${port}`));

client.login(process.env.DISCORD_TOKEN);