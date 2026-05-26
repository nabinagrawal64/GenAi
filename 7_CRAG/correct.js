/**
* Stage 3 : Knowledge Correction (correct.js)
*
*           Retrieved Documents
*                   ↓
*           Evaluate Retrieval
*  ┌───────────────┬───────────────┬
*  │               │               │
* correct      ambiguous       incorrect
*  │               │               │
* refine       hybrid path      web search
*  │               │               │
*  └───────────────┴───────────────┘
*                  ↓
*         Corrected Knowledge
*
*/

// correct.js

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
    console.log("Grading retrieved documents...");
    
    const documentsText = state.documents.map((doc, index) => {
        return `Document ${index + 1}:\n${doc.pageContent}`;
    }).join("\n\n");

    const SYSTEM_PROMPT = ` 
        You are a retrieval evaluator for a CRAG system.

        Your task: Evaluate whether the retrieved documents are relevant to the user's question.

        You must return ONLY one word:

        - correct
        → if documents are highly relevant

        - ambiguous
        → if documents are partially relevant or incomplete,contain mixed relevance or incomplete information

        - incorrect
        → if documents are mostly irrelevant

        Do not explain anything.
        Only return one word.
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
                    ${state.question}

                    Retrieved Documents:
                    ${documentsText}
                `,
            },
        ],
    });

    const grade = completion.choices[0].message.content.trim().toLowerCase();
    console.log("Retrieval Grade:", grade, "\n");

    return {
        ...state,
        retrievalGrade: grade,
    };
}

// Knowledge Refinement: extract relevant sentences, remove noise, compress context, merge useful information
export async function refineKnowledge(state) {
    console.log("Refining knowledge...\n");

    let knowledgeContext = "";
    if (state.retrievalGrade === "incorrect") {
        knowledgeContext = state.externalKnowledge || "";
    } else if (state.retrievalGrade === "ambiguous") {
        knowledgeContext = state.hybridKnowledge || "";
    } else {
        knowledgeContext = state.documents.map((doc) => doc.pageContent).join("\n\n");
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
                    ${state.question}

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
    
    const rewrittenQuery = state.rewrittenQuestion || state.question;
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

    const rewrittenQuery = state.rewrittenQuestion || state.question;

    // external retrieval
    const webResults = await webSearch(state);

    // internal retrieval
    const internalKnowledge = state.documents.map((doc) => doc.pageContent).join("\n\n");

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

    if (grade === "correct") {
        return "refineKnowledge";
    }  else if (grade === "ambiguous") {
        return "hybridSearch";
    } else if(grade === "incorrect") {
        return "webSearch";
    }

    return "refineKnowledge"; // default to refinement if grade is unclear
}

/**
*  correct
*    ↓
* refineKnowledge
*    ↓
*   END

* ambiguous
*    ↓
* hybridSearch
*    ↓
* refineKnowledge
*    ↓
*   END

* incorrect
*    ↓
* webSearch
*    ↓
* refineKnowledge
*    ↓
*   END

*/