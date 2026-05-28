import Groq from "groq-sdk";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generalAgent(state) {
    const query = state.query;
    const context = state.refinedKnowledge || state.documents?.join("\n\n") || "";
    const history = state.chatHistory?.map(m => `${m.role}: ${m.content}`).join("\n") || "";

    const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `You are an internal corporate assistant for Selim.ai. You must answer queries **strictly** using the facts provided in the context.
If the user asks about a policy, do not say 'it depends on configuration' or give a list of common industry responses. State the exact rule Selim.ai executes.
Never offer generic advice or suggest standard industry steps unless they are explicitly written in the retrieved text.

Context:
${context}

Conversation History:
${history}`,
            },
            {
                role: "user",
                content: query
            }
        ],
        stream: true,
    });

    let generalContent = "";
    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        generalContent += text;
    }

    return {
        ...state,
        answer: generalContent,
    };
}
