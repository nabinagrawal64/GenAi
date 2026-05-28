import Groq from "groq-sdk";
import { billingPrompt } from "../prompts/billingPrompt.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function billingAgent(state) {
    const query = state.query;
    const documents = state.documents || [];

    const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        messages: [
            {
                role: "system",
                content: billingPrompt(query, documents, state.chatHistory),
            },
            {
                role: "user",
                content: query,
            },
        ],
        stream: true,
    });

    let billingContent = "";
    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        billingContent += text;
    }

    return {
        ...state,
        answer: billingContent,
    };
}
