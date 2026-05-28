import Groq from "groq-sdk";
import { technicalPrompt } from "../prompts/technicalPrompt.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function technicalAgent(state) {
    const query = state.query;
    const documents = state.documents || [];

    const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: technicalPrompt(query, documents, state.chatHistory),
            },
            {
                role: "user",
                content: query,
            },
        ],
        stream: true,
    });

    let technicalContent = "";
    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        technicalContent += text;
    }

    return {
        ...state,
        answer: technicalContent,
    };
}
