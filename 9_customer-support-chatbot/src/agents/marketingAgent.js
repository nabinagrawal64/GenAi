import Groq from "groq-sdk";
import { marketingPrompt } from "../prompts/marketingPrompt.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function marketingAgent(state) {
    const query = state.query;
    const documents = state.documents || [];

    const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.5,
        messages: [
            {
                role: "system",
                content: marketingPrompt(query, documents, state.chatHistory),
            },
            {
                role: "user",
                content: query,
            },
        ],
        stream: true,
    });

    let marketingContent = "";
    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        marketingContent += text;
    }

    return {
        ...state,
        answer: marketingContent,
    };
}
