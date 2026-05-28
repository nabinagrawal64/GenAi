import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function queryRewriter(state) {
    console.log("Rewriting query for better retrieval...");

    const SYSTEM_PROMPT = `
        You are an expert query optimizer for a retrieval-augmented generation (RAG) system.
        Your task is to take the user's natural language question and rewrite it 
        to be a highly optimized search query for a vector database.
        
        Guidelines:
        - Focus on key concepts, entities, and main action words.
        - Remove conversational context, greetings, and fluff.
        - Expand upon implied context (e.g. if the user says 'payment issue', rewrite as 'How to resolve failed payment or billing issue').
        
        Return ONLY the rewritten query text, with no extra explanation or punctuation around it.
    `;

    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: state.query,
            },
        ],
    });

    const rewrittenQuery = response.choices[0].message.content.trim();
    console.log(`Original: "${state.query}"\nRewritten: "${rewrittenQuery} \n"`);

    return {
        ...state,
        rewrittenQuery,
    };
}