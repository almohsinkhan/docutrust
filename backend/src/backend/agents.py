import os
from typing import List, Dict, Any, TypedDict
from langgraph.graph import StateGraph, END
from .config import settings
from .rag_pipeline import vector_store, ranker
import httpx
import re
from datetime import datetime

class AgentState(TypedDict):
    question: str
    current_query: str
    documents: List[Dict[str, Any]]
    grade_result: str  # 'relevant', 'irrelevant'
    loop_count: int
    answer: str
    citations: List[Dict[str, Any]]
    logs: List[Dict[str, Any]]

# Groq Async Helper Function
async def call_groq(prompt: str, system_prompt: str = None) -> str:
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        raise ValueError("GROQ_API_KEY environment variable is not set. Please export your GROQ_API_KEY.")
    
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json"
    }
    
    # Supported Groq models cascade
    models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama3-8b-8192"]
    
    last_err = None
    for model in models:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 1024
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=headers, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"].strip()
                else:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            last_err = e
            print(f"Groq API call failed with model {model}: {e}")
            
    raise Exception(f"All Groq models failed. Last error: {last_err}")

# Web Search Fallback (DuckDuckGo)
async def search_web_fallback(query: str) -> List[Dict[str, Any]]:
    url = f"https://html.duckduckgo.com/html/?q={query}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=8)
            if response.status_code == 200:
                html = response.text
                snippets = re.findall(r'<a[^>]*class=["\']result__snippet["\'][^>]*>(.*?)</a>', html, re.DOTALL)
                titles = re.findall(r'<a[^>]*class=["\']result__url["\'][^>]*>(.*?)</a>', html, re.DOTALL)
                
                results = []
                for i in range(min(len(snippets), 3)):
                    snippet_text = re.sub(r'<[^>]+>', '', snippets[i]).strip()
                    snippet_text = re.sub(r'\s+', ' ', snippet_text)
                    title_text = re.sub(r'<[^>]+>', '', titles[i]).strip() if i < len(titles) else "Web Search Result"
                    title_text = re.sub(r'\s+', ' ', title_text)
                    results.append({
                        "text": snippet_text,
                        "filename": f"Web: {title_text}",
                        "page": 1,
                        "chunk_id": f"web_{i}"
                    })
                if results:
                    return results
    except Exception as e:
        print(f"Error in DuckDuckGo search: {e}")
        
    # Fallback search generator using Groq (if DDG is blocked or times out)
    try:
        prompt = f"Summarize key search results or general facts about: '{query}'. Provide a concise 2-sentence summary of the factual answer."
        text = await call_groq(prompt)
        return [{
            "text": text,
            "filename": "Web Fallback (AI generated)",
            "page": 1,
            "chunk_id": "web_fallback_ai"
        }]
    except Exception as e2:
        print(f"Error in Groq fallback search: {e2}")
        
    return []

# LangGraph Nodes
async def retrieve_node(state: AgentState) -> Dict[str, Any]:
    query = state["current_query"]
    question = state["question"]
    logs = list(state.get("logs", []))
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "Retriever",
        "action": "Retrieving documents",
        "status": "pending",
        "detail": f"Searching vector database for query: '{query}'"
    }
    logs.append(log_entry)
    
    try:
        chunks = vector_store.search(query, top_k=6)
        log_entry["status"] = "success"
        log_entry["detail"] = f"Retrieved {len(chunks)} document chunks from FAISS."
    except Exception as e:
        print(f"Retrieval error: {e}")
        chunks = []
        log_entry["status"] = "error"
        log_entry["detail"] = f"Retrieval failed: {e}"
        
    return {"documents": chunks, "logs": logs}

async def grade_node(state: AgentState) -> Dict[str, Any]:
    query = state["current_query"]
    documents = state["documents"]
    logs = list(state.get("logs", []))
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "Grader",
        "action": "Grading retrieval relevance",
        "status": "pending",
        "detail": "Analyzing relevance of retrieved document chunks..."
    }
    logs.append(log_entry)
    
    if not documents:
        log_entry["status"] = "success"
        log_entry["detail"] = "No documents found to grade. Routing to Query Rewriter/Web Fallback."
        return {"grade_result": "irrelevant", "logs": logs}
        
    # Attempt local cross-encoder re-ranking
    try:
        reranked_docs = ranker.rerank(query, documents)
        # Using a threshold score of -2.5 for relevance in cross-encoder ms-marco-MiniLM-L-6-v2
        relevant_docs = [doc for doc in reranked_docs if doc.get("rerank_score", -99.0) > -2.5]
    except Exception as e:
        print(f"Cross-encoder grading failed, using LLM fallback: {e}")
        # LLM fallback for grading
        relevant_docs = []
        try:
            for doc in documents:
                prompt = f"Assess if the following document chunk is relevant to the query.\nQuery: {query}\nChunk: {doc['text']}\nReply with ONLY 'Yes' or 'No'."
                ans = await call_groq(prompt)
                ans = ans.strip().lower()
                if "yes" in ans:
                    doc["rerank_score"] = 1.0
                    relevant_docs.append(doc)
                else:
                    doc["rerank_score"] = -5.0
        except Exception as llm_err:
            print(f"LLM grading fallback failed: {llm_err}")
            relevant_docs = documents
            
    if len(relevant_docs) > 0:
        log_entry["status"] = "success"
        log_entry["detail"] = f"Grading completed. Keep {len(relevant_docs)}/{len(documents)} relevant chunks. Highest score: {relevant_docs[0].get('rerank_score', 0):.2f}"
        return {"documents": relevant_docs, "grade_result": "relevant", "logs": logs}
    else:
        log_entry["status"] = "success"
        log_entry["detail"] = "All retrieved chunks were graded as irrelevant (below threshold). Routing to Query Rewriter."
        return {"grade_result": "irrelevant", "logs": logs}

async def rewrite_node(state: AgentState) -> Dict[str, Any]:
    question = state["question"]
    current_query = state["current_query"]
    loop_count = state.get("loop_count", 0)
    logs = list(state.get("logs", []))
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "Query Rewriter",
        "action": "Rewriting query",
        "status": "pending",
        "detail": f"Rewriting query to improve retrieval. Original: '{current_query}'"
    }
    logs.append(log_entry)
    
    new_loop_count = loop_count + 1
    
    try:
        prompt = f"""You are an advanced query-rewriting agent. The user's question is: "{question}"
        Our current retrieval query is: "{current_query}"
        The previous retrieval failed to return relevant chunks from our documents.
        Please rewrite this query to be optimized for a semantic vector database search.
        Focus on core keywords, concepts, and synonyms. Do not include question words like "how", "what", etc.
        Output ONLY the rewritten search query. Do not add any introduction, quotes, or formatting."""
        
        resp = await call_groq(prompt)
        new_query = resp.strip().replace('"', '').replace("'", "")
        
        log_entry["status"] = "success"
        log_entry["detail"] = f"Query rewritten from '{current_query}' to '{new_query}'"
        return {"current_query": new_query, "loop_count": new_loop_count, "logs": logs}
    except Exception as e:
        log_entry["status"] = "error"
        log_entry["detail"] = f"Query rewriting failed: {e}. Using original question."
        return {"current_query": question, "loop_count": new_loop_count, "logs": logs}

async def web_search_node(state: AgentState) -> Dict[str, Any]:
    question = state["question"]
    logs = list(state.get("logs", []))
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "Web Searcher",
        "action": "Performing web search",
        "status": "pending",
        "detail": f"Retrieving snippets from web for query: '{question}'"
    }
    logs.append(log_entry)
    
    results = await search_web_fallback(question)
    
    log_entry["status"] = "success"
    log_entry["detail"] = f"Web search fallback found {len(results)} snippets."
    
    return {"documents": results, "grade_result": "relevant", "logs": logs}

async def generate_node(state: AgentState) -> Dict[str, Any]:
    question = state["question"]
    documents = state["documents"]
    logs = list(state.get("logs", []))
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "Answer Generator",
        "action": "Generating answer",
        "status": "pending",
        "detail": f"Generating answer using {len(documents)} source chunks..."
    }
    logs.append(log_entry)
    
    if not documents:
        ans = "I'm sorry, I could not find any relevant information in the uploaded documents or web sources to answer your question."
        log_entry["status"] = "success"
        log_entry["detail"] = "No documents available. Outputted fallback answer."
        return {"answer": ans, "citations": [], "logs": logs}
        
    formatted_chunks = ""
    for i, doc in enumerate(documents):
        source = doc.get("filename", "Unknown Document")
        page = doc.get("page", 1)
        formatted_chunks += f"[{i+1}] Source: {source} (Page {page})\nText: {doc['text']}\n\n"
        
    prompt = f"""You are a precise, trust-worthy QA assistant for DocuTrust.
    Answer the user's question: "{question}"
    
    Use ONLY the following retrieved document chunks. Do not use external knowledge or hallucinate.
    If the answer cannot be found in the chunks, state clearly that you cannot find the answer in the provided documents.
    
    When you state a fact from a chunk, append a citation marker like [1], [2] at the end of the sentence.
    
    Retrieved Chunks:
    {formatted_chunks}
    
    Answer:"""
    
    try:
        answer_text = await call_groq(prompt)
        
        # Parse citations
        citations = []
        markers = re.findall(r'\[(\d+)\]', answer_text)
        unique_markers = sorted(list(set([int(m) for m in markers])))
        
        for idx in unique_markers:
            if 0 < idx <= len(documents):
                doc = documents[idx - 1]
                citations.append({
                    "citation_number": idx,
                    "filename": doc.get("filename", "Unknown"),
                    "page": doc.get("page", 1),
                    "snippet": doc.get("text", "")[:150] + "..." if len(doc.get("text", "")) > 150 else doc.get("text", ""),
                    "full_text": doc.get("text", ""),
                    "score": doc.get("rerank_score", doc.get("score", 1.0))
                })
                
        log_entry["status"] = "success"
        log_entry["detail"] = f"Answer generated successfully with {len(citations)} citations."
        return {"answer": answer_text, "citations": citations, "logs": logs}
    except Exception as e:
        log_entry["status"] = "error"
        log_entry["detail"] = f"Answer generation failed: {e}"
        return {"answer": f"Error generating answer: {e}", "citations": [], "logs": logs}

# Router logic
def decide_to_retrieve_or_fallback(state: AgentState) -> str:
    if state.get("grade_result") == "relevant":
        return "generate"
    loop_count = state.get("loop_count", 0)
    if loop_count >= 2:
        return "web_search"
    else:
        return "rewrite"

# Build LangGraph workflow
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("grade", grade_node)
workflow.add_node("rewrite", rewrite_node)
workflow.add_node("web_search", web_search_node)
workflow.add_node("generate", generate_node)

# Set entry point
workflow.set_entry_point("retrieve")

# Add edges
workflow.add_edge("retrieve", "grade")
workflow.add_conditional_edges(
    "grade",
    decide_to_retrieve_or_fallback,
    {
        "generate": "generate",
        "rewrite": "rewrite",
        "web_search": "web_search"
    }
)
workflow.add_edge("rewrite", "retrieve")
workflow.add_edge("web_search", "generate")
workflow.add_edge("generate", END)

# Compile graph
app_graph = workflow.compile()
