/** 
*        START
*          ↓
*     decide_retrieval
*       ↙       ↘
* retrieve   generate_direct
*    ↓             ↓
*   END           END
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
    question: "",
    route: "",
    answer: "",
    documents: "",
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

graph.addEdge(START, "decide_retrieval");
graph.addConditionalEdges("decide_retrieval",conditionalrouting);
graph.addEdge("retrieve", END);
graph.addEdge("generate_direct", END);

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
        console.log("Answer:", result.answer ?? result.documents);
    }

    rl.close();
}
