import Groq from "groq-sdk";
import { TavilySearch } from '@langchain/tavily';
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const tavilySearch = new TavilySearch({
    maxResults: 3,
    topic: 'general',
});

// Evaluate Retrieval: correct, ambiguous, incorrect
export async function gradeDocuments(state) {
    const documentsText = state.documents.map((doc, index) => {
        return `Document ${index + 1}:\n${doc || doc}`;
    }).join("\n\n");

    const SYSTEM_PROMPT = ` 
        You are a retrieval evaluator for a CRAG system.

        Your task: Evaluate how relevant the retrieved documents are to the user's question, and assign a score between 0.0 and 1.0.

        Rules:
        - Return ONLY a valid JSON object.
        - No extra text or markdown.
        - JSON Format:
        {
            "score": <number between 0.0 and 1.0>,
            "decision": "relevant" | "ambiguous" | "irrelevant"
        }

        Guidance for decision:
        - score >= 0.8  -> "relevant"
        - 0.5 <= score < 0.8 -> "ambiguous"
        - score < 0.5 -> "irrelevant"
    `;

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
                    Question:
                    ${state.query}

                    Retrieved Documents:
                    ${documentsText}
                `,
            },
        ],
    });

    let grade = "ambiguous";
    let score = 0;
    try {
        const content = completion.choices[0].message.content.trim();
        const parsed = JSON.parse(content);
        grade = parsed.decision?.toLowerCase() || "ambiguous";
        score = parsed.score || 0;
    } catch (e) {
        console.error("Failed to parse grading structured output:", e);
    }

    const currentRetry = (state.retryCount || 0) + 1;

    return {
        ...state,
        retrievalGrade: grade,
        reasoningGrade: score.toString(), // optionally store score if needed
        retryCount: currentRetry,
    };
}

// Knowledge Refinement: extract relevant sentences, remove noise, compress context, merge useful information
export async function refineKnowledge(state) {
    let knowledgeContext = "";
    if (state.retrievalGrade === "incorrect" || state.retrievalGrade === "irrelevant") {
        knowledgeContext = state.externalKnowledge || "";
    } else if (state.retrievalGrade === "ambiguous") {
        knowledgeContext = state.hybridKnowledge || "";
    } else {
        knowledgeContext = state.documents.map((doc) => doc).join("\n\n");
    }

    const SYSTEM_PROMPT = `
        You are a CRAG knowledge refinement system.

        Your task:
        - Extract relevant information
        - Remove noisy text
        - Compress context
        - Keep factual information

        Return ONLY refined knowledge.
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
                    ${state.query}

                    Knowledge Context:
                    ${knowledgeContext}
                `,
            },
        ],
    });

    const refinedKnowledge = completion.choices[0].message.content.trim();

    return {
        ...state,
        refinedKnowledge,
    };
}

export async function webSearch(state) {
    console.log("Performing web search...\n");
    
    const rewrittenQuery = state.rewrittenQuery || state.query;
    const response = await tavilySearch.invoke({ query: rewrittenQuery });

    const externalKnowledge = response.results?.map((result, index) => {
        return `
            Result ${index + 1}:

            Title:
            ${result.title}

            Content:
            ${result.content}

            Source:
            ${result.url}
        `;
    }).join("\n\n");

    return {
        ...state,
        externalKnowledge,
    };
}

export async function hybridSearch(state) {
    console.log("Performing hybrid search...\n");

    const rewrittenQuery = state.rewrittenQuery || state.query;

    // external retrieval
    const webResults = await webSearch(state);

    // internal retrieval
    const internalKnowledge = state.documents.map((doc) => doc).join("\n\n");

    // combine knowledge
    const hybridKnowledge = `
        Internal Knowledge: ${internalKnowledge}

        External Knowledge: ${webResults.externalKnowledge}
    `;

    return {
        ...state,
        hybridKnowledge,
    };
}

// Knowledge Correction: correct path, ambiguous path, incorrect path
export async function correctKnowledge(state) {
    const grade = state.retrievalGrade?.trim().toLowerCase();
    const retries = state.retryCount || 0;

    if (grade === "correct" || grade === "relevant") {
        return "refineKnowledge";
    }

    if (retries < 3) {
        return "queryRewriter";
    }

    if (grade === "ambiguous") {
        return "hybridSearch";
    } else if(grade === "incorrect" || grade === "irrelevant") {
        return "webSearch";
    }

    return "refineKnowledge"; // default to refinement if grade is unclear
}
