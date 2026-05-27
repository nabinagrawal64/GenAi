import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const embeddings = new HuggingFaceTransformersEmbeddings({
    model: "Xenova/all-MiniLM-L6-v2",
});

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY, });
const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

export async function indexTheDocument(filePath) {
    try {

        // 0. Check if document is already indexed
        const existingVectors = await index.namespace("default").query({
            vector: new Array(384).fill(0),
            topK: 1,
            includeMetadata: true,
            filter: {
                source: { "$eq": filePath },
            },
        });
        
        if (existingVectors.matches.length > 0) {
            console.log("\nDocument already indexed\n");
            return;
        }

        // 1. Load the PDF document
        const loader = new PDFLoader(filePath, { splitPages: false });
        const docs = await loader.load();
        console.log("PDF content length:", docs[0]?.pageContent?.length);

        // 2. Split the document into smaller chunks
        const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 100 });
        const splitDocs = await textSplitter.splitDocuments(docs);
        console.log("Split docs:", splitDocs.length);
        
        // 3. Generate embeddings for each chunk and prepare them for Pinecone
        const vectors = [];
        for (let i = 0; i < splitDocs.length; i++) {
            const chunk = splitDocs[i];
            const embedding = await embeddings.embedQuery( chunk.pageContent );

            vectors.push({
                id: `${filePath.replace(/[^a-zA-Z0-9]/g, "_")}-chunk-${i}`,
                values: embedding,
                metadata: {
                    text: chunk.pageContent.slice(0, 1000),
                    source: filePath,
                    chunkIndex: i,
                },
            });
        }

        // 4. Upload vectors to Pinecone in batches
        const batchSize = 100;
        for (let i = 0;i < vectors.length;i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            await index.namespace("default").upsert({ records: batch });
        }

        console.log("Document indexed successfully\n");
    } catch (error) {
        console.error("Error indexing document:",error);
    }
}

export { index, embeddings };