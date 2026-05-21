/**
 * Implementation plan
 * Stage 1: Indexting
 * 1. Load the document - pdf, text - completed
 * 2. Chunk the document - completed
 * 3. Generate vector embeddings - completed

 *
 * Stage 2: Using the chatbot
 * 1. Setup LLM 
 * 2. Add retrieval step
 * 3. Pass input + relevant information to LLM
 * 4. Congratulations
 */

import express from 'express';
import cors from 'cors';
import { indexTheDocument } from "./prepare.js";
import { chat } from "./chat_memory.js";

const filePath = './cg-internal-docs.pdf';

const app = express();
const port = 3001;
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Welcome to ChatDPT!');
});

app.post('/chat', async (req, res) => {
    const { message, threadId } = req.body;

    if (!message || !threadId) {
        res.status(400).json({ message: 'All fields are required!' });
        return;
    }

    console.log('Message', message);

    const result = await chat({ userMessage: message, threadId });
    res.json({ message: result });
});

async function startServer() {
    await indexTheDocument(filePath);

    app.listen(port, () => {
        console.log(`Server is running on port: ${port}`);
    });
}

startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});