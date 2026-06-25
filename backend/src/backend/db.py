from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import uuid
from .config import settings

client = AsyncIOMotorClient(settings.MONGODB_URI)
db = client[settings.DATABASE_NAME]

async def init_db():
    # Create indexes
    await db.users.create_index("username", unique=True)
    await db.documents.create_index("doc_id", unique=True)
    await db.chats.create_index("chat_id", unique=True)

# User Helpers
async def get_user(username: str):
    return await db.users.find_one({"username": username})

async def create_user(username: str, password_hash: str):
    user = {
        "username": username,
        "password_hash": password_hash,
        "created_at": datetime.utcnow()
    }
    await db.users.insert_one(user)
    return user

# Document Metadata Helpers
async def save_document_metadata(filename: str, doc_id: str, num_pages: int, num_chunks: int, file_size: int):
    doc = {
        "doc_id": doc_id,
        "filename": filename,
        "num_pages": num_pages,
        "num_chunks": num_chunks,
        "file_size": file_size,
        "upload_time": datetime.utcnow()
    }
    await db.documents.update_one({"doc_id": doc_id}, {"$set": doc}, upsert=True)
    return doc

async def get_all_documents():
    cursor = db.documents.find({}, {"_id": 0})
    return await cursor.to_list(length=1000)

async def delete_document_metadata(doc_id: str):
    await db.documents.delete_one({"doc_id": doc_id})

# Chat Session Helpers
async def get_chats_by_user(username: str):
    cursor = db.chats.find({"username": username}, {"_id": 0, "chat_id": 1, "title": 1, "updated_at": 1})
    return await cursor.to_list(length=1000)

async def get_chat(chat_id: str):
    return await db.chats.find_one({"chat_id": chat_id}, {"_id": 0})

async def create_chat(chat_id: str, username: str, title: str):
    chat = {
        "chat_id": chat_id,
        "username": username,
        "title": title,
        "messages": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    await db.chats.insert_one(chat)
    return chat

async def add_message_to_chat(chat_id: str, role: str, content: str, citations: list = None, logs: list = None):
    message = {
        "message_id": str(uuid.uuid4()),
        "role": role,
        "content": content,
        "citations": citations or [],
        "logs": logs or [],
        "timestamp": datetime.utcnow()
    }
    await db.chats.update_one(
        {"chat_id": chat_id},
        {
            "$push": {"messages": message},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    return message

async def delete_chat(chat_id: str):
    await db.chats.delete_one({"chat_id": chat_id})
