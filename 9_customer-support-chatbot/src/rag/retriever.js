import { index, embeddings } from "../prepare.js";

export const retriever = async (state) => {
    const query = state.rewrittenQuery || state.query;
    try {
        const queryEmbedding = await embeddings.embedQuery(query);

        // Define filter based on the department to only fetch relevant documents
        const filter = state.department ? { department: { "$eq": state.department } } : undefined;

        const response = await index.namespace("default").query({
            vector: queryEmbedding,
            topK: 5,
            includeMetadata: true,
            filter: filter,
        });
        
        let uniqueTexts = new Set();

        const documents = response.matches
            // .filter((match) => match.score >= 0.5) // Remove low-score chunks
            .filter((match) => {                   // Remove duplicate chunks
                if (uniqueTexts.has(match.metadata.text)) {
                    return false;
                }
                uniqueTexts.add(match.metadata.text);
                return true;
            })
            .sort((a, b) => b.score - a.score)     // Rerank chunks based on score sorting
            .map((match) => match.metadata.text);

        console.log(`Filtered down to ${documents.length} highly relevant unique documents.`);

        return {
            ...state,
            documents
        };
    } catch (error) {
        console.error("Error retrieving documents:", error);
        return { documents: [] };
    }
};
