import Groq from "groq-sdk";
import { frontdeskPrompt } from "../prompts/frontdeskPrompt.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function frontdeskAgent(state) {
    const query = state.query;

    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: frontdeskPrompt(query),
            },
            {
                role: "user",
                content: query
            }
        ]
    });

    try {
        const content = response.choices[0].message.content.trim();
        const parsed = JSON.parse(content);
        
        let department = parsed.department?.toLowerCase() || "general";
        
        // Example: If confidence is lower than a threshold, default to general
        if (parsed.confidence < 0.5 && department !== "general") {
            console.log("\nLow confidence in routing, defaulting to general.\n");
            department = "general";
        }

        console.log("\nRouting Decision:\n", JSON.stringify(parsed, null, 2), "\n");

        return {
            ...state,
            department,
        };
    } catch (error) {
        console.error("Failed to parse routing structured output:", error);
        return {
            ...state,
            department: "general",
        };
    }
}
