import { embeddings } from "../prepare.js";

const memoryCache = []; // simple in-memory semantic cache

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function checkCacheNode(state) {
    try {
        const queryEmbedding = await embeddings.embedQuery(state.query);
        
        for (const item of memoryCache) {
            const similarity = cosineSimilarity(queryEmbedding, item.embedding);
            if (similarity > 0.95) {
                console.log(`\n[CACHE HIT] Similarity: ${similarity.toFixed(3)}. Returning cached response.\n`);
                return {
                    ...state,
                    answer: item.answer,
                    isCached: true
                };
            }
        }
        
        return {
            ...state,
            currentQueryEmbedding: queryEmbedding,
            isCached: false
        };
    } catch (e) {
        console.error("Cache Check Error:", e);
        return { ...state, isCached: false };
    }
}

export async function updateCacheNode(state) {
    if (!state.isCached && state.answer && !state.hallucinated) {
        if (state.currentQueryEmbedding) {
            memoryCache.push({
                query: state.query,
                embedding: state.currentQueryEmbedding,
                answer: state.answer
            });
        }
    }
    return state;
}