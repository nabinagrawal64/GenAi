import { groq } from "../llm.js";

export async function writerNode(state) {
    let prompt = "";

    if (!state.critique) {
        prompt = `
        Write a professional LinkedIn post about:

        ${state.topic}

        Include:
        - Strong hook
        - Valuable insight
        - Short paragraphs
        - CTA
        `;
    } else {
        prompt = `
        You are an expert LinkedIn content writer.
        Rewrite the LinkedIn post using the feedback.
        Return ONLY the improved LinkedIn post.

        Do NOT:
        - Explain your changes
        - Add commentary
        - Add notes
        - Add markdown code blocks

        POST:
        ${state.post}

        FEEDBACK:
        ${state.critique}
        `;
    }

    console.log(`\n=== WRITER (${state.iteration + 1}) ===`);
    
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
        post: response.choices[0].message.content,
        iteration: state.iteration + 1,
    };
}
