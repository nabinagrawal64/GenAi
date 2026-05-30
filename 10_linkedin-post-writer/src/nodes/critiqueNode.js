import { groq } from "../llm.js";

export async function critiqueNode(state) {
    const prompt = `
        Review this LinkedIn post.

        Analyze:
        - Hook quality
        - Clarity
        - Engagement
        - CTA effectiveness

        Give actionable feedback.

        POST:
        ${state.post}
    `;

    console.log("\n=== CRITIQUE ===");
    
    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
    });

    return {
        critique: response.choices[0].message.content,
    };
}