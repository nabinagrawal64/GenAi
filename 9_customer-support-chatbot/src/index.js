import { indexTheDocument } from "./prepare.js";
import readline from "node:readline";
import { app } from "./graph/graph.js";
import path from "path";

async function chat() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const askQuestion = (query) => {
        return new Promise((resolve) => {
            rl.question(query, resolve);
        });
    };

    let chatHistory = [];

    while (true) {
        const question = await askQuestion("\nYou: ");
        if (question === "clear") break

        const result = await app.invoke({ query: question, chatHistory });
        
        // Output the final answer only once
        console.log("Answer:\n", result.answer);

        chatHistory.push({ role: "user", content: question });
        chatHistory.push({ role: "assistant", content: result.answer });
    }

    rl.close();
}

async function startServer() {
    // index documents
    // await indexTheDocument(filePath);

    // start chatbot
    await chat();
}

startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});
