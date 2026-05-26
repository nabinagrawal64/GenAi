import readline from "node:readline";
import Groq from "groq-sdk";
import { StateGraph, START, END } from "@langchain/langgraph";
import { index, embeddings } from "./prepare.js";
import { correctKnowledge, gradeDocuments, refineKnowledge, hybridSearch, webSearch } from "./correct.js";
import { generateAnswer } from "./generate.js";

import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, });

// Graph State
const GraphState = {
    question: "",
    rewrittenQuestion: "",
    documents: [],
    retrievalGrade: null,
    refinedKnowledge: null,
    externalKnowledge: null,
    hybridKnowledge: null,
    answer: null,
};

// Rewrite Query
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

// Retrieve Documents
export async function retrieveDocuments(state) {
    console.log("Retrieving documents...\n");
    const queryEmbedding = await embeddings.embedQuery( state.rewrittenQuestion );
    const response = await index
        .namespace("default")
        .query({
            vector: queryEmbedding,
            topK: 3,
            includeMetadata: true,
        });

    const documents = response.matches.map((match) => ({
        pageContent: match.metadata.text,
        score: match.score,
    }));

    return {
        ...state,
        documents,
    };
}

// Build Graph
const graph = new StateGraph({ channels: GraphState });

graph.addNode("rewriteQuery", rewriteQuery);
graph.addNode("retrieveDocuments", retrieveDocuments);
graph.addNode("gradeDocuments", gradeDocuments);
graph.addNode("refineKnowledge", refineKnowledge);
graph.addNode("hybridSearch",hybridSearch);
graph.addNode("webSearch",webSearch);
graph.addNode("generateAnswer",generateAnswer);

graph.addEdge(START, "rewriteQuery");
graph.addEdge("rewriteQuery", "retrieveDocuments");
graph.addEdge("retrieveDocuments", "gradeDocuments");

graph.addConditionalEdges("gradeDocuments", correctKnowledge);

graph.addEdge("hybridSearch","refineKnowledge");
graph.addEdge("webSearch","refineKnowledge");
graph.addEdge("refineKnowledge","generateAnswer");
graph.addEdge("generateAnswer", END);

const app = graph.compile();

// Chat Loop
export async function chat() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const askQuestion = (query) => {
        return new Promise((resolve) => {
            rl.question(query, resolve);
        });
    };

    while (true) {
        const question = await askQuestion("\nYou: ");
        if (question === "/bye") break

        const result = await app.invoke({ question });
        console.log("Answer:", result.answer);
    }

    rl.close();
}

/** 
*   START
*     ↓
* rewriteQuery
*     ↓
* retrieveDocuments
*     ↓
* gradeDocuments
*     ↓
* refineKnowledge
*     ↓ 
* Correction Paths:
*     ↓
* Correct Retrieval
*     ↓
* Generate Answer
*     ↓
*    END

* User Question
*     ↓
* Rewrite Query
*     ↓
* Retrieve Documents
*     ↓
* Grade Documents
*     ↓
* Refine Knowledge
*     ↓
* Correction Paths:
*     ↓
* Correct Retrieval
*     ↓
* Generate Answer
*     ↓
* Return Chunks

*/