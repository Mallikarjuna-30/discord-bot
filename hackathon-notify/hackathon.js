require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

async function fetchAndSendHackathons(client, Hackathon) {
    try {
        // Fetch hackathons from Brabble
        const response = await fetch(
            "https://brabble.ai/api/listings?hub=hackathons&mode=ONLINE&limit=20",
            {
                headers: {
                    "x-api-key": process.env.BRABBLE_API_KEY
                }
            }
        );
        const data = await response.json();
        console.log(`🔎 Brabble returned ${data.listings?.length || 0} hackathons`);
        for (const h of data.listings || []) {
            console.log(
                `🎯 ${h.title} | Prize: ${h.prize?.inr} | Deadline: ${h.deadline}`
            );
        }
        if (!response.ok) {
            throw new Error(JSON.stringify(data));
        }
        // Find #hackathons channel
        const channel = client.channels.cache.find(
            (channel) => channel.name === "hackathon-alert"
        );
        if (!channel) {
            console.log("❌ #hackathons channel not found");
            return;
        }
        // Process each hackathon
        for (const hackathon of data.listings) {
            if (hackathon.prize?.inr === null || hackathon.prize?.inr === undefined) continue;
            const deadline = new Date(hackathon.deadline);
            // Skip expired hackathons
            if (deadline <= new Date()) continue;
            // Check if already sent
            const existing = await Hackathon.findOne({
                url: hackathon.url
            });
            if (existing) continue;
            // Send to Discord
            await channel.send({
                embeds: [
                    {
                        title: `🎯 ${hackathon.title}`,
                        url: hackathon.url,
                        description: "🚀 **Online hackathon • Registration open!**",
                        color: 0x5865f2,
                        fields: [
                            {
                                name: "🏢 Organizer",
                                value: hackathon.organiser || "Not specified",
                                inline: true
                            },
                            {
                                name: "🌐 Platform",
                                value: hackathon.platform || "Not specified",
                                inline: true
                            },
                            {
                                name: "💻 Mode",
                                value: "Online",
                                inline: true
                            },
                            {
                                name: "🟢 Status",
                                value: "Registration Open",
                                inline: true
                            },
                            {
                                name: "⏰ Registration Deadline",
                                value:
                                    `<t:${Math.floor(deadline.getTime() / 1000)}:F>\n` +
                                    `(<t:${Math.floor(deadline.getTime() / 1000)}:R>)`,
                                inline: false
                            }
                        ],
                        footer: {
                            text: "🔔 Hackathon Alerts • MyServerBot"
                        },
                        timestamp: new Date()
                    }
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel("🚀 Register Now")
                            .setStyle(ButtonStyle.Link)
                            .setURL(hackathon.url)
                    )
                ]
            });
            // Save to MongoDB
            await Hackathon.create({
                title: hackathon.title,
                url: hackathon.url,
                source: hackathon.platform
            });
            console.log(`📢 Sent: ${hackathon.title}`);
        }
    } catch (error) {
        console.error("❌ Hackathon error:", error.message);
    }
}

module.exports = {
    fetchAndSendHackathons
};