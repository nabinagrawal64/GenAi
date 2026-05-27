/**
 * =========================================
 * Stage 1 : Indexing Pipeline (prepare.js)
 * =========================================
 *
 * 1. Load Documents
 *    - PDF / TXT / Docs
 *
 * 2. Split Documents
 *    - Chunking
 *    - Overlapping
 *
 * 3. Generate Embeddings
 *    - Convert text → vectors
 *
 * 4. Store Embeddings
 *    - Pinecone Vector DB
 *
 *
 * =========================================
 * Stage 2 : Retrieval Pipeline (chat.js)
 * =========================================
 *
 * 1. Receive User Question
 *
 * 2. Rewrite Query
 *    - Improve semantic meaning
 *    - Expand vague questions
 *    - Optimize retrieval quality
 *
 * 3. Retrieve Documents
 *    - Similarity Search
 *    - Top K Retrieval
 *    - Pinecone Vector DB
 *
 *
 * =========================================
 * Stage 3 : Knowledge Correction (correct.js)
 * =========================================
 *
 * 1. Evaluate Retrieval
 *    - Correct
 *    - Ambiguous
 *    - Incorrect
 *
 * 2. Knowledge Refinement
 *    - Extract relevant sentences
 *    - Remove noisy text
 *    - Compress context
 *    - Merge useful information
 *
 * 3. Knowledge Correction
 *
 *    A. Correct Path
 *       - Use refined internal knowledge
 *
 *    B. Ambiguous Path
 *       - Combine internal + external knowledge
 *
 *    C. Incorrect Path
 *       - Rewrite query again
 *       - Perform web search
 *       - Fetch external knowledge
 * 
 * 
 * =========================================
 * Stage 4 : Generation
 * =========================================
 *
 * 1. Prepare Final Context
 *    - Corrected knowledge
 *    - Refined knowledge
 *    - External knowledge
 *
 * 2. Generate Final Answer
 *    - Send context + question to LLM
 *
 * 3. Return Response
 *
 * =========================================
 */

import { indexTheDocument } from "./prepare.js";
import { chat } from "./stage_6.js";

const filePath = "./Atomic_habits.pdf";

async function startServer() {
    // index documents
    // await indexTheDocument(filePath);

    // start chatbot
    await chat();
}

startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});
