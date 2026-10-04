require("dotenv").config();
const http = require("http");

const { connectDB, Hackathon } = require("./hackathon-notify/database");
const { fetchAndSendHackathons } = require("./hackathon-notify/hackathon");

const OpenAI = require("openai");
const ai = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1"
});

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Warning storage
const warnings = new Map();
const welcomeChannels = new Map();

// Create the /ping command
const commands = [
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check if the bot is online"),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show all available commands"),

    new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Show information about a user"),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Show information about the server"),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Delete messages from this channel")
        .addIntegerOption(option =>
            option
                .setName("amount")
                .setDescription("Number of messages to delete")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member to warn")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the warning")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Show a user's warnings")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("rules")
        .setDescription("Show the server rules"),

    new SlashCommandBuilder()
        .setName("setup-welcome")
        .setDescription("Set the channel for welcome messages")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Channel where welcome messages should be sent")
                .setRequired(true)
        )
].map(command => command.toJSON());

// Register the command
const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);
client.on("error", error => {
    console.error("❌ Discord client error:", error);
});

client.on("shardDisconnect", (event, id) => {
    console.log(`🔴 Discord disconnected (shard ${id}):`, event.code, event.reason);
});

client.on("shardReconnecting", id => {
    console.log(`🟡 Discord reconnecting (shard ${id})...`);
});

client.on("shardResume", (id, replayedEvents) => {
    console.log(`🟢 Discord connection resumed (shard ${id}), replayed events: ${replayedEvents}`);
});

client.once("clientReady", async () => {
    console.log(`🤖 ${client.user.tag} is online!`);
    await connectDB();
    fetchAndSendHackathons(client, Hackathon);
    setInterval(() => {
        fetchAndSendHackathons(client, Hackathon);
    }, 2 * 60 * 60 * 1000);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log("✅ /ping command registered!");
    } catch (error) {
        console.error(error);
    }
});

// Handle commands
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
        interaction.reply("🏓 Pong!");
    }

    if (interaction.commandName === "help") {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🤖 MyServerBot")
            .setDescription("Here are the available commands:")
            .addFields(
                {
                    name: "🏓 General",
                    value: "`/ping` - Check if the bot is online\n`/help` - Show this help message"
                },
                {
                    name: "👋 Server",
                    value: "More server features coming soon..."
                }
            )
            .setFooter({
                text: "MyServerBot • Your server assistant"
            });
        interaction.reply({
            embeds: [helpEmbed]
        });
    }
    if (interaction.commandName === "userinfo") {
        const user = interaction.user;
        const userEmbed = new EmbedBuilder()
            .setTitle("👤 User Information")
            .setThumbnail(user.displayAvatarURL())
            .addFields(
                {
                    name: "Username",
                    value: user.username,
                    inline: true
                },
                {
                    name: "User ID",
                    value: user.id,
                    inline: true
                },
                {
                    name: "Account Created",
                    value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`
                }
            )
            .setFooter({
                text: "MyServerBot"
            });
        interaction.reply({
            embeds: [userEmbed]
        });
    }
    if (interaction.commandName === "serverinfo") {
        const server = interaction.guild;
        const serverEmbed = new EmbedBuilder()
            .setTitle("🏠 Server Information")
            .setThumbnail(server.iconURL())
            .addFields(
                {
                    name: "Server Name",
                    value: server.name,
                    inline: true
                },
                {
                    name: "Members",
                    value: `${server.memberCount}`,
                    inline: true
                },
                {
                    name: "Server ID",
                    value: server.id,
                    inline: true
                },
                {
                    name: "Created",
                    value: `<t:${Math.floor(server.createdTimestamp / 1000)}:F>`
                }
            )
            .setFooter({
                text: "MyServerBot"
            });
        interaction.reply({
            embeds: [serverEmbed]
        });
    }
    if (interaction.commandName === "clear") {
        const amount = interaction.options.getInteger("amount");
        if (interaction.replied || interaction.deferred) return;
        await interaction.deferReply({ flags: 64 });
        const deleted = await interaction.channel.bulkDelete(amount, true);
        await interaction.editReply({
            content: `🧹 Deleted ${deleted.size} messages!`
        });
        return;
    }
    if (interaction.commandName === "warn") {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");
        if (!warnings.has(user.id)) {
            warnings.set(user.id, []);
        }
        warnings.get(user.id).push({
            reason: reason,
            moderator: interaction.user.id,
            date: new Date()
        });
        const warnEmbed = new EmbedBuilder()
            .setTitle("⚠️ Member Warned")
            .addFields(
                {
                    name: "Member",
                    value: `${user}`,
                    inline: true
                },
                {
                    name: "Reason",
                    value: reason,
                    inline: true
                },
                {
                    name: "Total Warnings",
                    value: `${warnings.get(user.id).length}`,
                    inline: true
                }
            )
            .setFooter({
                text: "MyServerBot Moderation"
            });
        interaction.reply({
            embeds: [warnEmbed]
        });
    }
    if (interaction.commandName === "warnings") {
        const user = interaction.options.getUser("user");
        const userWarnings = warnings.get(user.id) || [];
        if (userWarnings.length === 0) {
            interaction.reply(
                `✅ ${user} has no warnings.`
            );
            return;
        }
        const warningList = userWarnings
            .map((warning, index) =>
                `**${index + 1}.** ${warning.reason}`
            )
            .join("\n");
        const warningEmbed = new EmbedBuilder()
            .setTitle(`⚠️ Warning History`)
            .setDescription(`${user}`)
            .addFields({
                name: "Warnings",
                value: warningList
            })
            .setFooter({
                text: `Total warnings: ${userWarnings.length}`
            });
        interaction.reply({
            embeds: [warningEmbed]
        });
    }
    if (interaction.commandName === "rules") {
        const rulesEmbed = new EmbedBuilder()
            .setTitle("📜 Server Rules")
            .setDescription("Please follow these rules to keep the server friendly.")
            .addFields(
                {
                    name: "1️⃣ Be respectful",
                    value: "Treat everyone with respect."
                },
                {
                    name: "2️⃣ No spam",
                    value: "Avoid repeated or unnecessary messages."
                },
                {
                    name: "3️⃣ No inappropriate content",
                    value: "Keep the server safe and appropriate."
                },
                {
                    name: "4️⃣ No unwanted advertising",
                    value: "Don't advertise without permission."
                },
                {
                    name: "5️⃣ Follow Discord's rules",
                    value: "You must follow Discord's Terms of Service and Community Guidelines."
                }
            )
            .setFooter({
                text: "By staying in the server, you agree to follow these rules."
            });
        interaction.reply({
            embeds: [rulesEmbed]
        });
    }
    if (interaction.commandName === "setup-welcome") {
        const channel = interaction.options.getChannel("channel");
        welcomeChannels.set(interaction.guild.id, channel.id);
        interaction.reply({
            content: `✅ Welcome messages will now be sent to ${channel}.`,
            flags: 64
        });
    }
});
// AI - Bot
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.channel.name !== "ai-chat") return;
    try {
        await message.channel.sendTyping();
        const response = await fetch(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`
                },
                body: JSON.stringify({
                    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are a helpful Discord assistant. Give short, clear, natural answers. Never show your thinking or reasoning. Only provide the final answer."
                        },
                        {
                            role: "user",
                            content: message.content
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 200,
                    chat_template_kwargs: {
                        enable_thinking: false
                    }
                })
            }
        );
        const data = await response.json();
        if (!response.ok) {
            throw new Error(JSON.stringify(data));
        }
        let replyText = data.choices?.[0]?.message?.content || "";
        replyText = replyText
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .trim();
        if (!replyText) {
            await message.reply("⚠️ I received an empty response from the AI.");
            return;
        }
        await message.reply(replyText);
    } catch (error) {
        console.error("NVIDIA AI Error:", error);
        await message.reply(
            "⚠️ AI is temporarily unavailable. Please try again later."
        );
    }
});

// Welcome new members
client.on("guildMemberAdd", (member) => {
    const channelId = welcomeChannels.get(member.guild.id);
    if (!channelId) return;
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) return;
    const welcomeEmbed = new EmbedBuilder()
        .setTitle("👋 Welcome to the server!")
        .setDescription(
            `Hey ${member}! 🎉\n\nWe're happy to have you here!`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            {
                name: "👥 Member Count",
                value: `${member.guild.memberCount}`,
                inline: true
            },
            {
                name: "📜 Getting Started",
                value: "Check the server rules and have fun!",
                inline: true
            }
        )
        .setFooter({
            text: `Welcome to ${member.guild.name}!`
        })
        .setTimestamp();
    channel.send({
        embeds: [welcomeEmbed]
    });
});

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Discord bot is running!");
}).listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);