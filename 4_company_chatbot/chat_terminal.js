import readline from 'node:readline';
import Groq from 'groq-sdk';
import { vectorStore } from './prepare.js';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function chat() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const askQuestion = (query) => {
        return new Promise((resolve) => {
            rl.question(query, resolve);
        });
    };

    while (true) {
        const question = await askQuestion("You: ");

        if (question === "/bye") {
            break;
        }

        // retrieval
        const relevantChunks = await vectorStore.similaritySearch(question, 3);
        const context = relevantChunks.map((chunk) => chunk.pageContent).join('\n\n');

        const SYSTEM_PROMPT = `You are an assistant for question-answering tasks. 
        Use the following relevant pieces of retrieved context to answer the question. 
        If you don't know the answer, say I don't know.`;

        const userQuery = `Question: ${question}
                            Relevant context: ${context}
                            Answer:`;
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT,
                },
                {
                    role: 'user',
                    content: userQuery,
                },
            ],
            model: 'llama-3.3-70b-versatile',
        });

        console.log(`Assistant: ${completion.choices[0].message.content}`);
    }

    rl.close();
}
