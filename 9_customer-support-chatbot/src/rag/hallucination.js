import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function hallucinationGrader(state) {
    const SYSTEM_PROMPT = `
        You are a hallucination grader. 
        Your task is to determine whether the assistant's answer is grounded in the provided documents.
        
        Rules:
        - Return ONLY a valid JSON object.
        - JSON Format:
        {
            "hallucination": "yes" | "no",
            "score": <number between 0.0 and 1.0>,
            "reason": "Brief explanation"
        }
        
        Guidance:
        - "no" means the answer is grounded in the documents.
        - "yes" means the answer contains information NOT present in the documents (hallucination).
        
        Note: If documents are empty or not provided and the query is a general conversation, it's NOT a hallucination. Just say "no".
    `;

    const context = state.refinedKnowledge || state.documents?.map(d => d).join("\n") || "No documents provided.";

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: `
                    Documents:
                    ${context}

                    Answer:
                    ${state.answer}
                `,
            },
        ],
    });

    try {
        const content = completion.choices[0].message.content.trim();
        const parsed = JSON.parse(content);
        return {
            ...state,
            hallucinated: parsed.hallucination?.toLowerCase() === "yes",
            retryCount: (state.retryCount || 0) + 1,
        };
    } catch (error) {
        console.error("Failed to parse hallucination grade:", error);
        return {
            ...state,
            hallucinated: false,
            retryCount: (state.retryCount || 0) + 1,
        };
    }
}
