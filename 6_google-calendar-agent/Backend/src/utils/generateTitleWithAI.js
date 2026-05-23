import { ChatGroq } from "@langchain/groq";
import dotenv from "dotenv";
dotenv.config();

const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-120b",
});

export async function generateTitleWithAI(userText) {
    try {
        const prompt = `
            Generate a concise chat history title from the user's first message.

            Rules:
            - Use 4 to 5 words maximum
            - Capture the main topic or intent
            - Remove unnecessary words
            - Use title case
            - Do not use quotation marks
            - Do not end with punctuation
            - Return ONLY the title

            Examples:

                Input:
                I want to know the current weather in Delhi tomorrow morning

                Output:
                Delhi Weather Tomorrow Morning

                Input:
                can you explain binary search with examples and edge cases

                Output:
                Binary Search Examples

                Input:
                please help me create a google calendar event for my project meeting

                Output:
                Project Meeting Calendar Event

            User message:
            ${userText}
        `;

        const response = await llm.invoke(prompt);
        return response.content
            .trim()
            .replace(/^["'`]+|["'`.]+$/g, "")
            .split(/\s+/)
            .slice(0, 6)
            .join(" ");
    } catch (error) {
        console.log("TITLE AI ERROR:");
        console.log(error);

        return userText
            .replace(/\s+/g, " ")
            .replace(/[^\w\s-]/g, "")
            .trim()
            .split(" ")
            .slice(0, 6)
            .join(" ") || "New chat";
    }
}
