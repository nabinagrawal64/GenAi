# Customer Support Chatbot

This project implements an intelligent customer support chatbot leveraging **LangGraph**, **Pinecone**, and **Corrective Retrieval-Augmented Generation (CRAG)**. 

The chatbot handles customer queries, dynamically retrieves context from company documents (via Pinecone vector search), grades the relevance of the retrieved data, supplements missing context with web searches if needed (via Tavily), and ultimately routes the consolidated knowledge to specialized department agents to provide highly accurate, context-aware answers.

## Architecture & Workflow

The architecture follows a robust **CRAG (Corrective RAG)** flow state graph:

```text
                             ┌───────────────┐
                             │     USER      │
                             └───────┬───────┘
                                     │
                                     ▼
                           ┌───────────────────┐
                           │  FRONTDESK AGENT  │ (Query Routing)
                           └─────────┬─────────┘
                                     │
                                     ▼
                           ┌───────────────────┐
                           │    RETRIEVER      │ (Pinecone Vector retrieval)
                           └─────────┬─────────┘
                                     │
                                     ▼
                           ┌───────────────────┐
                           │  GRADE DOCUMENTS  │ (CRAG Evaluation)
                           └─────────┬─────────┘
                                     │
             ┌───────────────────────┼───────────────────────┐
  (Incorrect)│            (Ambiguous)│             (Correct) │
             ▼                       ▼                       │
     ┌───────────────┐      ┌───────────────┐                │
     │  WEB SEARCH   │      │ HYBRID SEARCH │                │
     │   (Tavily)    │      │ (Web + Vector)│                │
     └───────┬───────┘      └───────┬───────┘                │
             └──────────────────────┼────────────────────────┘
                                    ▼
                          ┌───────────────────┐ 
                          │ REFINE KNOWLEDGE  │ (Context consolidation)
                          └─────────┬─────────┘
                                    │
                                    ▼
                          (Department Routing)
                                    │
        ┌───────────────────────────┼──────────────────────────────┐
        │                  │                  │                    │
        ▼                  ▼                  ▼                    ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐  ┌────────────────┐
│Technical Agent │ │ Billing Agent  │ │Marketing Agent │  │ General Agent  │
└────────┬───────┘ └────────┬───────┘ └────────┬───────┘  └────────┬───────┘
         │                  │                  │                   │
         └──────────────────┴────────┬─────────┴───────────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │ Final Answer │
                              └──────────────┘
```

## Features

- **Multi-Agent Architecture**: Dedicated specialized agents (Frontdesk, Technical, Billing, Marketing, General).
- **Corrective RAG (CRAG)**: Examines retrieval quality and decides whether to search the web, use local documents, or combine both.
- **Dynamic Web Search**: Integrates Tavily for external knowledge lookups when local knowledge is insufficient.
- **Vector Database**: Connects with Pinecone to store and query PDF embeddings efficiently.
- **State Orchestration**: Uses LangGraph to meticulously manage channels, context state, retries, and conditional logic flow.
- **LLM Inferencing**: Fully utilizes Groq (Llama-3.3-70b-versatile) for lightning-fast inference and grading logic.

## Tech Stack

- **LangGraph** & **LangChain** (Node.js)
- **Pinecone**
- **HuggingFace** (`Xenova/all-MiniLM-L6-v2` for embeddings)
- **Groq** (`llama-3.3-70b-versatile` for language models)
- **Tavily** API (for internet search tools)
- **Node.js** (JavaScript)
