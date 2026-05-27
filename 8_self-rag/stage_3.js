/** 
*              START
*                ↓
*           decide retrieval
*            ↙          ↘
*       retrieve       generate_direct
*          ↓                 ↓
*     is_relevant           END
*      ↙       ↘
*   generate     no
*     from    relevant
*   context     docs
*      ↓         ↓
*     END       END
*
*/

import readline from "node:readline";
import Groq from "groq-sdk";
import { StateGraph, START, END } from "@langchain/langgraph";
import { index, embeddings } from "./prepare.js";

import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, });

const GraphState = {
    question: null,
    route: null,
    answer: null,
    documents: null,
    relevantDocs: null,
};

const graph = new StateGraph({ channels: GraphState });

const conditionalrouting = (state) => {
    return state.route.trim();
};

// new
const relevanceRouting = (state) => {
    if (state.relevantDocs?.length > 0) {
        return "generate_from_context".trim();
    }

    return "no_relevant_docs".trim();
}

async function decideRetrieval(state) {
    const prompt = `
        You are a retrieval routing agent.

        Your task is to decide whether a question should use:
        - retrieval from the vector database
        OR
        - direct LLM generation.

        Use retrieval for:
        - questions about books
        - uploaded PDFs
        - user-specific knowledge
        - detailed factual lookup
        - anything requiring grounded context
        - questions asking purpose, summary, themes, concepts, explanations

        Use generate_direct only for:
        - casual conversation
        - greetings
        - simple common knowledge
        - math/basic reasoning

        Return ONLY ONE WORD:
        retrieve
        or
        generate_direct

        Question:
        ${state.question}
    `;

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: prompt
            },
            {
                role: "user",
                content: state.question,
            },
        ],
    });

    const route = completion.choices[0].message.content.trim().toLowerCase();
    console.log("Routing Decision:", route);

    return {
        ...state,
        route,
    };
}

async function retrieve(state) {
    // Vector Search
    const queryEmbedding = await embeddings.embedQuery( state.question );
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

async function isRelevant(state) {
    const question = state.question;
    const relevantDocs = [];

    for (const doc of state.documents) {
        const prompt = `
            You are a document relevance grader.

            Your task is to determine whether this document chunk is useful for answering the user's question.

            Rules:
            - If documents contain information useful for answering the question strongly → return "relevant"
            - Otherwise → return "not_relevant"

            Only return:
            relevant or not_relevant

            Question:
            ${question}

            Documents:
            ${doc.pageContent}
        `;

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: prompt,
                },
                {
                    role: "user",
                    content: question,
                }
            ],
        });

        const relevance = completion.choices[0].message.content.trim().toLowerCase();
        
        if (relevance.includes("relevant") && !relevance.includes("not_relevant")) {
            relevantDocs.push(doc);
        } else if (relevance === "relevant") {
            relevantDocs.push(doc);
        }
    }

    console.log("Total Retrieved Docs:", state.documents.length);
    console.log("Relevant Docs Count:", relevantDocs.length);
    return {
        ...state,
        relevantDocs,
    };
}

async function generateDirect(state) {
    const prompt = `
        You are an assistant that answers questions based on your general knowledge.
        Question:
        ${state.question}
        Answer:
    `;

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: prompt
            },
            {
                role: "user",
                content: state.question,
            },
        ],
    });

    const answer = completion.choices[0].message.content;
    return {
        ...state,
        answer,
    };
}

// new
async function generateFromContext(state) {
    console.log("Generating answer from context...");
    const question = state.question;
    const context = state.relevantDocs.map((doc) => doc.pageContent).join("\n\n");

    const prompt = `
        You are a helpful AI assistant.

        Answer the question ONLY using the provided context.

        Rules:
        - Do not make up information
        - If answer is not in context, say:
        "I could not find reliable information."

        Context:
        ${context}

        Question:
        ${question}

        Answer:
    `;

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: prompt,
            },
            {
                role: "user",
                content: question,
            }
        ],
    });

    const answer = completion.choices[0].message.content;

    return {
        ...state,
        answer,
    };
}

// new
async function noRelevantDocs(state) {
    return {
        ...state,
        answer: "No relevant documents were found for this question.",
    };
}

graph.addNode("decide_retrieval", decideRetrieval);
graph.addNode("retrieve", retrieve);
graph.addNode("generate_direct", generateDirect);
graph.addNode("is_relevant", isRelevant);
graph.addNode("generate_from_context",generateFromContext); // new
graph.addNode("no_relevant_docs",noRelevantDocs); // new

graph.addEdge(START, "decide_retrieval");
graph.addConditionalEdges("decide_retrieval",conditionalrouting,);
graph.addEdge("retrieve", "is_relevant");
graph.addConditionalEdges("is_relevant",relevanceRouting); // new
graph.addEdge("generate_from_context", END); // new
graph.addEdge("no_relevant_docs", END); // new
graph.addEdge("generate_direct", END);

const app = graph.compile();

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
        console.log("\nAnswer:", result.answer);
    }

    rl.close();
}
