import { indexTheDocument } from "./prepare.js";
import { chat } from "./stage_6.js";

const filePath = "./Atomic_habits.pdf";

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
