# DocuTrust: Enterprise Advanced Self-Correction RAG Platform

DocuTrust is a production-grade, self-correcting Retrieval-Augmented Generation (RAG) platform that solves the issue of hallucinations in basic AI document portals. Using a **Corrective RAG (CRAG)** architectural pattern implemented with **LangGraph**, DocuTrust evaluates document retrieval quality in real-time, rewrites queries if relevant chunks are missing, executes web-search fallbacks, and generates verified answers with strict citations.

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
2. **Grader**: Assesses the relevance of each retrieved chunk using a local Cross-Encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`) with a strict logit threshold and a LLM-based fallback.
3. **Query Rewriter**: If the grader finds all retrieved chunks irrelevant, this node rewrites the search query using Gemini to optimize it for semantic matching.
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
- **LLM**: Gemini API (configured via `GEMINI_API_KEY`)

---

## 🚀 Running the Project

### 🐳 Method A: Docker Compose (Easiest)
Deploy the entire stack (MongoDB, FastAPI backend, and React frontend) with a single command:

1. Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
2. Build and run the containers:
   ```bash
   docker compose up --build
   ```
3. Open the application:
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:8000](http://localhost:8000)
   - Backend API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 💻 Method B: Local Development

#### 1. Start MongoDB
Ensure MongoDB is running locally on port `27017` (e.g., via Docker):
```bash
docker run -d -p 27017:27017 --name docutrust-mongo mongo:latest
```

#### 2. Run Backend
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Run the development server using `uv`:
   ```bash
   export GEMINI_API_KEY="your_api_key"
   uv run uvicorn src.backend.main:app --host 0.0.0.0 --port 8000 --reload
   ```

#### 3. Run Frontend
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies and start Vite:
   ```bash
   npm install
   npm run dev
   ```
3. Open [http://localhost:5173](http://localhost:5173) in your browser.

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
└── README.md
```
