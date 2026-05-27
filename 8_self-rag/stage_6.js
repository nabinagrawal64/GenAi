/** 
*                     START
*                       ↓
*                decide retrieval
*                ↙          ↘
*           retrieve       generate_direct
*              ↓                 ↓
*         is_relevant           END
*         ↙        ↘
*      generate      no
*        from     relevant
*      context      docs
*        ↓           ↓
*     is_sup        END
*     ↙    ↘↖
* accept   revise
* answer   answer
*   ↓         
*  is_use  → rewrite_question → retrieve
*   ↙   ↘
*  END  no_relevant_docs
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

    supportGrade: null,
    reason: null,

    retryCount: 0,
    maxRetries: 5,

    usefulnessGrade: null,
    usefulnessReason: null,

    rewriteCount: 0,
    maxRewriteRetries: 2,
};
const graph = new StateGraph({ channels: GraphState });

const conditionalrouting = (state) => {
    return state.route.trim();
};

const relevanceRouting = (state) => {
    if (state.relevantDocs?.length > 0) {
        return "generate_from_context".trim();
    }

    return "no_relevant_docs".trim();
}

const supportRouting = (state) => {
    const grade = state.supportGrade?.trim();
    console.log("Support Routing:", grade);
    console.log("Retry Count:", state.retryCount);

    if (grade === "supported") {
        return "accept_answer";
    }

    // Retry limit reached
    if (state.retryCount >= state.maxRetries) {
        console.log("Max retries reached.");
        return "no_relevant_docs";
    }
    return "revise_answer";
};

// new
const usefulnessRouting = (state) => {

    const grade = state.usefulnessGrade?.trim();
    console.log("Usefulness Routing:",grade);
    console.log("Rewrite Count:",state.rewriteCount);

    // Good answer
    if (grade === "useful") return END

    // Stop rewrite loop
    if (state.rewriteCount >=state.maxRewriteRetries) {
        console.log("Max rewrite retries reached.");
        return "no_relevant_docs";
    }

    // Retry retrieval with rewritten query
    if (grade === "partially_useful") {
        return "rewrite_question";
    }

    return "no_relevant_docs";
};

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
            topK: 5,
            includeMetadata: true,
        });

    const documents = response.matches
        .filter((match) => match.score > 0.6)
        .map((match) => ({
            pageContent: match.metadata.text,
            score: match.score,
        }
    ));

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

async function generateFromContext(state) {
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

async function noRelevantDocs(state) {
    return {
        ...state,
        answer: "No relevant documents were found for this question.",
    };
}

async function isSup(state) {
    const context = state.relevantDocs.map((doc) => doc.pageContent).join("\n\n");

    const prompt = `
        You are a hallucination detection agent.

        Your task is to determine whether the generated answer is fully supported by the provided context.

        Return ONLY ONE of these:
        - supported
        → if the answer is fully grounded in the context

        - partially_supported
        → if some parts are supported but some claims are missing or weakly supported

        - not_supported
        → if the answer mostly contains hallucinated or unsupported information

        Return ONLY valid JSON.
        Example:
        {
            "grade": "partially_supported",
            "reason": "The explanation of atomic habits is supported, but the publication year is not present in the context."
        }

        Context:
        ${context}

        Generated Answer:
        ${state.answer}
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
                content: context,
            }
        ],
    });

    let supportGrade, reason;
    try {
        const parsed = JSON.parse(completion.choices[0].message.content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()
        );

        supportGrade = parsed.grade.trim().toLowerCase();
        reason = parsed.reason.trim();
    } catch (error) {
        console.error("Error parsing JSON from isSup:", error);
        supportGrade = "parsing_error";
        reason = "Failed to parse JSON response.";
    }

    console.log("Support Check:",supportGrade);
    console.log("Reason:", reason);

    return {
        ...state,
        supportGrade,
        reason,
    };
}

async function acceptAnswer(state) {
    console.log("Answer accepted.");
    return {
        ...state,
    };
}

async function reviseAnswer(state) {
    console.log("Revising answer...");
    const context = state.relevantDocs.map((doc) => doc.pageContent).join("\n\n");

    const prompt = `
        You are an answer revision agent.

        Your task is to revise the generated answer so that it becomes fully supported by the provided context.

        Rules:
        - Remove hallucinated claims
        - Keep only information grounded in context
        - Improve clarity
        - Keep answer concise and accurate

        Context:
        ${context}

        Original Answer:
        ${state.answer}

        Support Analysis:
        Grade: ${state.supportGrade}

        Reason:
        ${state.reason}

        Return ONLY the revised answer.
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
                content: context,
            }
        ],
    });

    const revisedAnswer = completion.choices[0].message.content.trim();
    return {
        ...state,
        answer: revisedAnswer,
        retryCount: state.retryCount + 1,
    };
}

// new
async function isUse(state) {
    const prompt = `
        You are an answer usefulness evaluator.

        Your task is to determine whether the generated answer is useful for the user's question.

        Evaluate:
        - completeness
        - clarity
        - helpfulness
        - specificity

        Return ONLY valid JSON.

        Possible grades:

        1. useful
        → Answer is clear, complete, and helpful.

        2. partially_useful
        → Answer is somewhat useful but lacks clarity, detail, or completeness.

        3. not_useful
        → Answer fails to help the user meaningfully.

        Example:
        {
            "grade": "partially_useful",
            "reason": "The answer is correct but lacks sufficient detail and explanation."
        }

        Question:
        ${state.question}

        Generated Answer:
        ${state.answer}
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
                content: state.answer,
            }
        ],
    });

    let usefulnessGrade;
    let usefulnessReason;
    try {
        const parsed = JSON.parse(completion.choices[0].message.content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()
        );

        usefulnessGrade = parsed.grade.trim().toLowerCase();
        usefulnessReason = parsed.reason.trim();
    } catch (error) {
        usefulnessGrade = "not_useful";
        usefulnessReason = "Failed to parse usefulness evaluation.";
    }

    console.log("Usefulness Grade:",usefulnessGrade);
    console.log("Usefulness Reason:", usefulnessReason);
    return {
        ...state,
        usefulnessGrade,
        usefulnessReason,
    };
}

// new
async function rewriteQuestion(state) {

    console.log("Rewriting question...");
    const prompt = `
        You are a query rewriting agent.

        Your task is to rewrite the user's question to improve retrieval quality.

        Rules:
        - Make the question more specific
        - Preserve original intent
        - Optimize for semantic retrieval
        - Keep concise

        Original Question:
        ${state.question}

        Return ONLY the rewritten question.
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
                content: state.question,
            }
        ],
    });

    const rewrittenQuestion = completion.choices[0] .message.content .trim();
    console.log("Rewritten Question:",rewrittenQuestion);

    return {
        ...state,
        question: rewrittenQuestion,
        retryCount: 0,
        rewriteCount: state.rewriteCount + 1,
    };
}

graph.addNode("decide_retrieval", decideRetrieval);
graph.addNode("retrieve", retrieve);
graph.addNode("generate_direct", generateDirect);
graph.addNode("is_relevant", isRelevant);
graph.addNode("generate_from_context",generateFromContext); 
graph.addNode("no_relevant_docs",noRelevantDocs); 
graph.addNode("is_sup", isSup); 
graph.addNode("accept_answer",acceptAnswer); 
graph.addNode("revise_answer",reviseAnswer); 
graph.addNode("is_use", isUse); // new
graph.addNode("rewrite_question",rewriteQuestion); // new

graph.addEdge(START, "decide_retrieval");
graph.addConditionalEdges(
    "decide_retrieval",
    conditionalrouting,
    {
        retrieve: "retrieve",
        generate_direct: "generate_direct",
    }
);
graph.addEdge("retrieve", "is_relevant");
graph.addConditionalEdges(
    "is_relevant",
    relevanceRouting,
    {
        generate_from_context:
            "generate_from_context",

        no_relevant_docs:
            "no_relevant_docs",
    }
); 
graph.addEdge("generate_from_context", "is_sup"); 
graph.addEdge("no_relevant_docs", END); 
graph.addConditionalEdges(
    "is_sup",
    supportRouting,
    {
        accept_answer:
            "accept_answer",

        revise_answer:
            "revise_answer",

        no_relevant_docs:
            "no_relevant_docs",
    }
); 
graph.addEdge("revise_answer", "is_sup"); 
graph.addEdge("accept_answer", "is_use");  // new
graph.addConditionalEdges(
    "is_use",
    usefulnessRouting,
    {
        rewrite_question:
            "rewrite_question",

        no_relevant_docs:
            "no_relevant_docs",

        [END]: END,
    }
); // new
graph.addEdge("rewrite_question","retrieve");

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

        const result = await app.invoke({ 
            question, 
            retryCount: 0, 
            rewriteCount: 0,
            maxRetries: 5,
            maxRewriteRetries: 2
        }, { recursionLimit: 500 } );
        console.log("\nAnswer:", result.answer);
    }

    rl.close();
}

