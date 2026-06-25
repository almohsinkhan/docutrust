# DocuTrust: Enterprise Advanced Self-Correction RAG Platform

DocuTrust is a production-grade, self-correcting Retrieval-Augmented Generation (RAG) platform that solves the issue of hallucinations in basic AI document portals. Using a **Corrective RAG (CRAG)** architectural pattern implemented with **LangGraph**, DocuTrust evaluates document retrieval quality in real-time, rewrites queries if relevant chunks are missing, executes web-search fallbacks using DuckDuckGo, and generates verified answers with strict citations.

---

## 🏗️ Architecture

```
               Upload PDFs
                     │
                     ▼
          Extract text from PDF
                     │
                     ▼
             Split into chunks
                     │
                     ▼
          Generate embeddings
                     │
                     ▼
            Store in Vector DB
                     │
────────────────────────────────────────

User asks a question

                     │
                     ▼
           Retrieve relevant chunks
                     │
                     ▼
         Check if chunks are relevant
                     │
             Yes            No
             │              │
             ▼              ▼
      Send to LLM      Rewrite query
             │              │
             └──────┬───────┘
                    ▼
            Generate answer
                    │
                    ▼
          Show citations + sources
```

### 🧠 LangGraph State Machine Nodes
1. **Retriever**: Performs semantic search on the local FAISS index using `all-MiniLM-L6-v2` embeddings.
2. **Grader**: Assesses the relevance of each retrieved chunk using a local Cross-Encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`) with a strict logit threshold and a Groq-based fallback.
3. **Query Rewriter**: If the grader finds all retrieved chunks irrelevant, this node rewrites the search query using Groq to optimize it for semantic matching.
4. **Web Search Fallback**: If query rewriting fails to yield relevant chunks after multiple loops, the agent performs a fallback search using DuckDuckGo to obtain web snippets.
5. **Answer Generator**: Generates the final, strictly sourced response with bracketed citations (e.g., `[1]`, `[2]`), mapping back to local documents and page numbers.

---

## 🛠️ Technology Stack
- **Frontend**: React + Tailwind CSS v4, Lucide Icons, Vite
- **Backend**: FastAPI (Python 3.12+), `uv` package manager
- **Database**: MongoDB (via `motor` asynchronous driver)
- **Vector Database**: FAISS (in-memory, serialized to disk)
- **Embedding Models**: SentenceTransformers (`all-MiniLM-L6-v2`)
- **Ranking Models**: Cross-Encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`)
- **LLM**: Groq Cloud API (configured via `GROQ_API_KEY`)
  - *Models Cascade*: `llama-3.3-70b-versatile` ➔ `llama-3.1-8b-instant` ➔ `llama3-8b-8192`

---

## 🚀 Running the Project

### 💻 Local Development (Easiest)

#### 1. Setup Environment
Ensure your Groq API key is set in your environment:
```bash
export GROQ_API_KEY="gsk_your_groq_api_key_here"
```

#### 2. Run the Startup Helper
From the root of the project (`~/docutrust`), run:
```bash
bash run_docutrust.sh
```
*This script will verify your MongoDB container is running, repair/synchronize python dependencies, and launch the frontend (port 5173) and backend (port 8000) services in the background. Press `Ctrl+C` to terminate the servers.*

---

### 🐳 Docker Compose
Deploy the entire stack (MongoDB, FastAPI backend, and React frontend) in containers:

1. Stop any standalone MongoDB container to avoid port conflicts:
   ```bash
   docker stop docutrust-mongo
   ```
2. Build and run the containers:
   ```bash
   export GROQ_API_KEY="gsk_your_groq_api_key_here"
   docker compose up --build
   ```
3. Open the application:
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📁 Workspace Directory Structure
```
docutrust/
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── src/
│       └── backend/
│           ├── __init__.py
│           ├── config.py
│           ├── db.py
│           ├── rag_pipeline.py
│           ├── agents.py
│           └── main.py
├── frontend/
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── index.css
│       ├── App.jsx
│       └── App.css
├── uploads/              <-- PDF storage directory (Initially empty)
├── docker-compose.yml
├── run_docutrust.sh
└── README.md
```
