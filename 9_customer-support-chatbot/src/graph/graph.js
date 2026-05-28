import { StateGraph, END, START } from "@langchain/langgraph";

import { frontdeskAgent } from "../agents/frontdeskAgent.js";
import { technicalAgent } from "../agents/technicalAgent.js";
import { billingAgent } from "../agents/billingAgent.js";
import { marketingAgent } from "../agents/marketingAgent.js";
import { generalAgent } from "../agents/generalAgent.js";
import { retriever } from "../rag/retriever.js";
import { queryRewriter } from "../rag/queryRewriter.js";
import { gradeDocuments, refineKnowledge, webSearch, hybridSearch, correctKnowledge } from "../rag/correct.js";
import { hallucinationGrader } from "../rag/hallucination.js";
import { checkCacheNode, updateCacheNode } from "../rag/cache.js";

const graph = new StateGraph({
    channels: {
        chatHistory: {
            value: (x, y) => y ?? x,
            default: () => []
        },
        query: null,
        rewrittenQuery: "",
        department: null,
        answer: null,

        documents: null,
        relevantDocuments: null,

        retryCount: 0,
        maxTries: 3,

        retrievalGrade: null,
        reasoningGrade: null,

        // cache and eval channels
        isCached: null,
        currentQueryEmbedding: null,
        
        refinedKnowledge: null,
        externalKnowledge: null,
        hybridKnowledge: null,
        hallucinated: null,
    },
});

graph.addNode("checkCache", checkCacheNode);
graph.addNode("updateCache", updateCacheNode);
graph.addNode("frontdesk", frontdeskAgent);
graph.addNode("technical", technicalAgent);
graph.addNode("billing", billingAgent);
graph.addNode("marketing", marketingAgent);
graph.addNode("general", generalAgent);
graph.addNode("queryRewriter", queryRewriter);
graph.addNode("retriever", retriever);
graph.addNode("gradeDocuments", gradeDocuments);
graph.addNode("refineKnowledge", refineKnowledge);
graph.addNode("webSearch", webSearch);
graph.addNode("hybridSearch", hybridSearch);

graph.addNode("hallucinationGrader", hallucinationGrader);

graph.addEdge("frontdesk", "retriever");
graph.addEdge("queryRewriter", "retriever");
graph.addEdge("retriever", "gradeDocuments");

graph.addConditionalEdges("gradeDocuments", correctKnowledge, {
    refineKnowledge: "refineKnowledge",
    queryRewriter: "queryRewriter",
    hybridSearch: "hybridSearch",
    webSearch: "webSearch",
});

graph.addEdge("hybridSearch", "refineKnowledge");
graph.addEdge("webSearch", "refineKnowledge");

graph.addConditionalEdges("refineKnowledge", (state) => state.department, {
    technical: "technical",
    billing: "billing",
    marketing: "marketing",
    general: "general",
});

graph.addEdge(START, "checkCache");

graph.addConditionalEdges("checkCache", (state) => {
    if (state.isCached) {
        return END;  // fast path end
    }
    return "frontdesk";
}, {
    frontdesk: "frontdesk",
});

graph.addEdge("technical", "hallucinationGrader");
graph.addEdge("billing", "hallucinationGrader");
graph.addEdge("marketing", "hallucinationGrader");
graph.addEdge("general", "hallucinationGrader");

graph.addConditionalEdges("hallucinationGrader", (state) => {
    if (state.hallucinated && (state.retryCount || 0) < 3) {
        return state.department; // loop back to regenerate if hallucinated
    }
    return "updateCache";
}, {
    technical: "technical",
    billing: "billing",
    marketing: "marketing",
    general: "general",
    updateCache: "updateCache"
});

graph.addEdge("updateCache", END);

export const app = graph.compile();
