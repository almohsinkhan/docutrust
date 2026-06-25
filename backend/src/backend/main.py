import os
import uuid
import shutil
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import fitz  # PyMuPDF

from .config import settings
from .db import (
    init_db, get_user, create_user, save_document_metadata, 
    get_all_documents, delete_document_metadata, get_chats_by_user, 
    get_chat, create_chat, add_message_to_chat, delete_chat, db
)
from .rag_pipeline import vector_store, extract_chunks_from_pdf
from .agents import app_graph

app = FastAPI(title="DocuTrust API", description="Enterprise Advanced RAG Platform with Automated Self-Correction")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory JWT/Token store for simplification or direct token generation
# Let's use standard SHA256 tokens for session authentication
ACTIVE_SESSIONS = {}

# Password hashing
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + ":" + key.hex()

def verify_password(stored_password_hash: str, provided_password: str) -> bool:
    try:
        salt_hex, key_hex = stored_password_hash.split(":")
        salt = bytes.fromhex(salt_hex)
        key = bytes.fromhex(key_hex)
        new_key = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt, 100000)
        return new_key == key
    except Exception:
        return False

# Pydantic schemas
class UserLogin(BaseModel):
    username: str
    password: str

class UserRegister(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    token: str
    username: str

class ChatCreate(BaseModel):
    title: str

class ChatMessageInput(BaseModel):
    question: str
    chat_id: Optional[str] = None

class FeedbackInput(BaseModel):
    message_id: str
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

# Dependency to check auth token
async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication header"
        )
    token = authorization.split(" ")[1]
    if token not in ACTIVE_SESSIONS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid"
        )
    return ACTIVE_SESSIONS[token]

@app.on_event("startup")
async def startup_event():
    await init_db()
    # Load FAISS index on startup
    vector_store.load_index()

@app.post("/register", response_model=Token)
async def register(user_data: UserRegister):
    username = user_data.username.strip()
    password = user_data.password
    
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        
    existing_user = await get_user(username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
        
    password_hash = hash_password(password)
    await create_user(username, password_hash)
    
    token = str(uuid.uuid4())
    ACTIVE_SESSIONS[token] = username
    return {"token": token, "username": username}

@app.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    username = user_data.username.strip()
    password = user_data.password
    
    user = await get_user(username)
    if not user or not verify_password(user["password_hash"], password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    token = str(uuid.uuid4())
    ACTIVE_SESSIONS[token] = username
    return {"token": token, "username": username}

@app.post("/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        ACTIVE_SESSIONS.pop(token, None)
    return {"detail": "Logged out successfully"}

@app.get("/documents")
async def list_documents(current_user: str = Depends(get_current_user)):
    return await get_all_documents()

@app.post("/upload")
async def upload_documents(
    files: List[UploadFile] = File(...),
    current_user: str = Depends(get_current_user)
):
    uploaded_files_metadata = []
    
    for file in files:
        if not file.filename.endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"File {file.filename} is not a PDF")
            
        doc_id = str(uuid.uuid4())
        filepath = os.path.join(settings.UPLOADS_DIR, f"{doc_id}.pdf")
        
        # Save file to uploads folder
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_size = os.path.getsize(filepath)
        
        # Count pages and extract chunks
        try:
            doc = fitz.open(filepath)
            num_pages = len(doc)
            doc.close()
        except Exception as e:
            os.remove(filepath)
            raise HTTPException(status_code=400, detail=f"Failed to parse PDF {file.filename}: {e}")
            
        chunks = extract_chunks_from_pdf(filepath, file.filename)
        
        # Add chunks to vector store
        if chunks:
            vector_store.add_chunks(chunks)
            
        # Save metadata to MongoDB
        doc_meta = await save_document_metadata(
            filename=file.filename,
            doc_id=doc_id,
            num_pages=num_pages,
            num_chunks=len(chunks),
            file_size=file_size
        )
        uploaded_files_metadata.append(doc_meta)
        
    return {"message": f"Successfully uploaded and indexed {len(files)} file(s)", "files": uploaded_files_metadata}

@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: str = Depends(get_current_user)):
    # Find file path
    filepath = os.path.join(settings.UPLOADS_DIR, f"{doc_id}.pdf")
    
    # Delete from disk
    if os.path.exists(filepath):
        os.remove(filepath)
        
    # Delete metadata from MongoDB
    await delete_document_metadata(doc_id)
    
    # Rebuild index from remaining files
    docs = await get_all_documents()
    remaining_paths = [os.path.join(settings.UPLOADS_DIR, f"{d['doc_id']}.pdf") for d in docs]
    
    # Rebuild FAISS index
    num_chunks = vector_store.rebuild_index(remaining_paths)
    
    return {"message": f"Document deleted and FAISS index rebuilt with {num_chunks} remaining chunks."}

@app.get("/history")
async def get_history(current_user: str = Depends(get_current_user)):
    return await get_chats_by_user(current_user)

@app.get("/history/{chat_id}")
async def get_chat_session(chat_id: str, current_user: str = Depends(get_current_user)):
    chat = await get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if chat["username"] != current_user:
        raise HTTPException(status_code=403, detail="Forbidden")
    return chat

@app.delete("/history/{chat_id}")
async def delete_chat_session(chat_id: str, current_user: str = Depends(get_current_user)):
    chat = await get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if chat["username"] != current_user:
        raise HTTPException(status_code=403, detail="Forbidden")
    await delete_chat(chat_id)
    return {"message": "Chat history deleted successfully"}

@app.post("/chat")
async def chat_endpoint(
    chat_input: ChatMessageInput,
    current_user: str = Depends(get_current_user)
):
    question = chat_input.question.strip()
    chat_id = chat_input.chat_id
    
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")
        
    # If no chat_id provided, create a new chat session
    if not chat_id:
        chat_id = str(uuid.uuid4())
        # Generate title from first 4 words
        title = " ".join(question.split()[:5])
        if len(title) > 40:
            title = title[:37] + "..."
        await create_chat(chat_id, current_user, title)
    else:
        # Verify chat belongs to user
        chat = await get_chat(chat_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat session not found")
            if chat["username"] != current_user:
                raise HTTPException(status_code=403, detail="Forbidden")
                
    # Add User Message to history
    await add_message_to_chat(chat_id, role="user", content=question)
    
    # Run the Corrective RAG LangGraph workflow
    inputs = {
        "question": question,
        "current_query": question,
        "documents": [],
        "grade_result": "irrelevant",
        "loop_count": 0,
        "answer": "",
        "citations": [],
        "logs": []
    }
    
    try:
        outputs = await app_graph.ainvoke(inputs)
        answer = outputs.get("answer", "Error running RAG pipeline.")
        citations = outputs.get("citations", [])
        logs = outputs.get("logs", [])
    except Exception as e:
        print(f"Error executing agent graph: {e}")
        answer = f"An error occurred while processing your request: {e}"
        citations = []
        logs = [{"timestamp": datetime.utcnow().isoformat(), "agent": "System", "action": "Execution", "status": "error", "detail": str(e)}]
        
    # Add Assistant Message to history with citations and logs
    assistant_msg = await add_message_to_chat(
        chat_id, 
        role="assistant", 
        content=answer, 
        citations=citations, 
        logs=logs
    )
    
    return {
        "chat_id": chat_id,
        "message": assistant_msg,
        "logs": logs
    }

@app.post("/chat/{chat_id}/feedback")
async def submit_feedback(
    chat_id: str,
    feedback: FeedbackInput,
    current_user: str = Depends(get_current_user)
):
    chat = await get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if chat["username"] != current_user:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    # Update the specific message with feedback
    # We find the message by message_id and push feedback
    feedback_doc = {
        "feedback_rating": feedback.rating,
        "feedback_comment": feedback.comment,
        "feedback_time": datetime.utcnow()
    }
    
    result = await db.chats.update_one(
        {"chat_id": chat_id, "messages.message_id": feedback.message_id},
        {"$set": {
            "messages.$.feedback": feedback_doc
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Message not found in chat session")
        
    return {"message": "Feedback submitted successfully", "feedback": feedback_doc}
