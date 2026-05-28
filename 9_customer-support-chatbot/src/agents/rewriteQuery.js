async function rewriteQuery(state) {
    console.log("Rewriting query...\n");

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `
                    You are a query rewriter.

                    Your job:
                    - Improve the user's query for semantic retrieval.
                    - Expand vague questions.
                    - Keep original meaning unchanged.
                    - Return ONLY the rewritten query.
                `,
            },
            {
                role: "user",
                content: state.question,
            },
        ],
    });

    const rewrittenQuestion = completion.choices[0].message.content;
    console.log("Rewritten Query:", rewrittenQuestion);
    return {
        ...state,
        rewrittenQuestion,
    };
}