/**
* Correct Retrieval
*     ↓
* Refined Internal Knowledge
*     ↓
* Generate Answer
* 
*
* Ambiguous Retrieval
*     ↓
* Hybrid Knowledge
*     ↓
*  Refine
*     ↓
* Generate Answer
* 
*
* Incorrect Retrieval
*     ↓
* Web Search
*     ↓
* Refine
*     ↓
* Generate Answer

*/

import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function generateAnswer(state) {
    console.log("Generating final answer...\n");

    const SYSTEM_PROMPT = `
        You are a helpful AI assistant.

        Answer the user's question using ONLY
        the provided knowledge context.

        Rules:
        - Be clear and concise
        - Do not hallucinate
        - If answer is unavailable, say:
        "I could not find reliable information."

        Return ONLY the final answer.
    `;

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: `
                    Question:
                    ${state.rewrittenQuestion}
                    
                    Knowledge Context:
                    ${state.refinedKnowledge}
                `,
            },
        ],
    });

    const answer = completion.choices[0].message.content.trim();
    return {
        ...state,
        answer,
    };
}
