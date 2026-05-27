/** 
*        START
*          ↓
*     decide_retrieval
*       ↙       ↘
* retrieve   generate_direct
*    ↓             ↓
* is_relevant     END
*    ↓
*   END
*/

import readline from "node:readline";
import Groq from "groq-sdk";
import { StateGraph, START, END } from "@langchain/langgraph";
import { index, embeddings } from "./prepare.js";

import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, });

const GraphState = {
    question: "",
    route: "",
    answer: "",
    documents: [],
    relevantDocs: [],
};

const graph = new StateGraph({ channels: GraphState });

const conditionalrouting = (state) => {
    return state.route.trim();
};

async function decideRetrieval(state) {
    const prompt = `
        You are a routing agent.
        Decide whether the user question requires retrieval from external documents.

        Rules:
        - If the question needs documents, PDFs, knowledge base, or context → return "retrieve"
        - If general knowledge is enough → return "generate_direct"

        Only return one word:
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

    const route = completion.choices[0].message.content.trim();;
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

// New
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

        const relevance = completion.choices[0].message.content.trim();
        if (relevance === "relevant") {
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

graph.addNode("decide_retrieval", decideRetrieval);
graph.addNode("retrieve", retrieve);
graph.addNode("generate_direct", generateDirect);
graph.addNode("is_relevant", isRelevant); // new

graph.addEdge(START, "decide_retrieval");
graph.addConditionalEdges("decide_retrieval",conditionalrouting);
graph.addEdge("retrieve", "is_relevant");
graph.addEdge("is_relevant", END);
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
        console.log("Answer:", result.answer ?? result.relevantDocs);
    }

    rl.close();
}
