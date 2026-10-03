require("dns").setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");

const hackathonSchema = new mongoose.Schema({
    title: String,
    url: {
        type: String,
        unique: true
    },
    source: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Hackathon = mongoose.model("Hackathon", hackathonSchema);

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
    }
}

module.exports = { connectDB, Hackathon };