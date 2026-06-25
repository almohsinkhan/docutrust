import React, { useState, useEffect, useRef } from 'react'
import { 
  Shield, Upload, Trash2, Send, Plus, LogOut, FileText, CheckCircle2, 
  XCircle, AlertCircle, RefreshCw, ChevronRight, ThumbsUp, ThumbsDown, 
  MessageSquare, HelpCircle, Star, Sparkles, BookOpen, Layers, Settings, Globe
} from 'lucide-react'
import './App.css'

const API_BASE = "http://localhost:8000"

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "")
  const [username, setUsername] = useState(localStorage.getItem("username") || "")
  const [isLogin, setIsLogin] = useState(true)
  const [authUsername, setAuthUsername] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authError, setAuthError] = useState("")
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)

  // Dashboard state
  const [chats, setChats] = useState([])
  const [currentChatId, setCurrentChatId] = useState("")
  const [messages, setMessages] = useState([])
  const [documents, setDocuments] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [inputQuestion, setInputQuestion] = useState("")
  const [dragActive, setDragActive] = useState(false)
  
  // Inspection panel (Right Pane)
  const [selectedMessageId, setSelectedMessageId] = useState(null)
  
  // Feedback state
  const [feedbackRating, setFeedbackRating] = useState(5)
  const [feedbackComment, setFeedbackComment] = useState("")
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  // UI States
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (token) {
      fetchChats()
      fetchDocuments()
    }
  }, [token])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Authentication Handlers
  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthError("")
    setIsLoadingAuth(true)

    const endpoint = isLogin ? "/login" : "/register"
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || "Authentication failed")
      }

      localStorage.setItem("token", data.token)
      localStorage.setItem("username", data.username)
      setToken(data.token)
      setUsername(data.username)
      setAuthUsername("")
      setAuthPassword("")
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsLoadingAuth(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch (err) {
      console.error("Logout error", err)
    }
    localStorage.removeItem("token")
    localStorage.removeItem("username")
    setToken("")
    setUsername("")
    setChats([])
    setMessages([])
    setDocuments([])
    setCurrentChatId("")
    setSelectedMessageId(null)
  }

  // Data Fetching
  const fetchChats = async () => {
    try {
      const response = await fetch(`${API_BASE}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setChats(data)
      } else if (response.status === 401) {
        handleLogout()
      }
    } catch (err) {
      console.error("Failed to fetch chats", err)
    }
  }

  const fetchChatDetails = async (chatId) => {
    try {
      const response = await fetch(`${API_BASE}/history/${chatId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
        setCurrentChatId(chatId)
        
        // Select last assistant message for the right panel details
        const assistantMsgs = (data.messages || []).filter(m => m.role === 'assistant')
        if (assistantMsgs.length > 0) {
          setSelectedMessageId(assistantMsgs[assistantMsgs.length - 1].message_id)
        } else {
          setSelectedMessageId(null)
        }
        // Reset feedback
        setFeedbackSubmitted(false)
        setFeedbackComment("")
        setFeedbackRating(5)
      }
    } catch (err) {
      console.error("Failed to fetch chat details", err)
    }
  }

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setDocuments(data)
      }
    } catch (err) {
      console.error("Failed to fetch documents", err)
    }
  }

  // Document Operations
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleUploadFiles(e.dataTransfer.files)
    }
  }

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await handleUploadFiles(e.target.files)
    }
  }

  const handleUploadFiles = async (filesList) => {
    setIsUploading(true)
    setErrorMsg("")
    setSuccessMsg("")
    const formData = new FormData()
    
    let pdfCount = 0
    for (let i = 0; i < filesList.length; i++) {
      if (filesList[i].name.endsWith(".pdf")) {
        formData.append("files", filesList[i])
        pdfCount++
      }
    }

    if (pdfCount === 0) {
      setErrorMsg("Please select at least one PDF file.")
      setIsUploading(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      const data = await response.json()
      if (response.ok) {
        setSuccessMsg(data.message)
        fetchDocuments()
      } else {
        setErrorMsg(data.detail || "Upload failed")
      }
    } catch (err) {
      setErrorMsg("Upload failed due to network error.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteDocument = async (docId) => {
    if (!confirm("Are you sure you want to delete this document? The FAISS index will be rebuilt.")) return
    try {
      const response = await fetch(`${API_BASE}/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchDocuments()
        setSuccessMsg("Document deleted and index rebuilt.")
      }
    } catch (err) {
      console.error("Failed to delete document", err)
    }
  }

  // Chat Operations
  const handleNewChat = () => {
    setCurrentChatId("")
    setMessages([])
    setSelectedMessageId(null)
    setFeedbackSubmitted(false)
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    const question = inputQuestion.trim()
    if (!question || isGenerating) return

    setInputQuestion("")
    setIsGenerating(true)

    // Optimistically add user message
    const tempUserMsg = {
      message_id: 'temp_user',
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])

    // Optimistically add empty assistant message with pending logs
    const tempAssistantMsg = {
      message_id: 'temp_assistant',
      role: 'assistant',
      content: '',
      citations: [],
      logs: [
        { agent: "Retriever", action: "Retrieving documents", status: "pending", detail: "Connecting to FAISS vector database..." }
      ],
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempAssistantMsg])
    setSelectedMessageId('temp_assistant')

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          question,
          chat_id: currentChatId || null
        })
      })

      const data = await response.json()
      if (response.ok) {
        if (!currentChatId) {
          setCurrentChatId(data.chat_id)
          fetchChats()
        }
        
        // Replace temp messages with actual response
        setMessages(prev => {
          const filtered = prev.filter(m => m.message_id !== 'temp_user' && m.message_id !== 'temp_assistant')
          const updated = [...filtered, {
            message_id: data.message.message_id,
            role: 'user',
            content: question,
            timestamp: new Date().toISOString()
          }, data.message]
          return updated
        })
        
        setSelectedMessageId(data.message.message_id)
      } else {
        setErrorMsg(data.detail || "Chat generation failed")
        // Remove temp messages
        setMessages(prev => prev.filter(m => m.message_id !== 'temp_user' && m.message_id !== 'temp_assistant'))
        setSelectedMessageId(null)
      }
    } catch (err) {
      setErrorMsg("Failed to communicate with agent pipeline.")
      setMessages(prev => prev.filter(m => m.message_id !== 'temp_user' && m.message_id !== 'temp_assistant'))
      setSelectedMessageId(null)
    } finally {
      setIsGenerating(false)
      // Reset feedback
      setFeedbackSubmitted(false)
      setFeedbackComment("")
      setFeedbackRating(5)
    }
  }

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation()
    if (!confirm("Delete this chat session?")) return
    try {
      const response = await fetch(`${API_BASE}/history/${chatId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        fetchChats()
        if (currentChatId === chatId) {
          handleNewChat()
        }
      }
    } catch (err) {
      console.error("Failed to delete chat", err)
    }
  }

  // Feedback Submission
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault()
    if (!selectedMessageId || selectedMessageId.startsWith('temp')) return
    
    try {
      const response = await fetch(`${API_BASE}/chat/${currentChatId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message_id: selectedMessageId,
          rating: feedbackRating,
          comment: feedbackComment
        })
      })

      if (response.ok) {
        setFeedbackSubmitted(true)
        // Update local message list to reflect feedback has been saved
        setMessages(prev => prev.map(m => {
          if (m.message_id === selectedMessageId) {
            return {
              ...m,
              feedback: {
                feedback_rating: feedbackRating,
                feedback_comment: feedbackComment,
                feedback_time: new Date().toISOString()
              }
            }
          }
          return m
        }))
      }
    } catch (err) {
      console.error("Failed to submit feedback", err)
    }
  }

  const getActiveMessage = () => {
    return messages.find(m => m.message_id === selectedMessageId) || null
  }

  const activeMessage = getActiveMessage()

  // Calculate overall confidence rating based on citation scores
  const getConfidenceLevel = (msg) => {
    if (!msg || !msg.citations || msg.citations.length === 0) return 0
    // For ms-marco-MiniLM-L-6-v2, logit scores above 0 are extremely confident.
    // Let's map scores dynamically to a percentage:
    // Score >= 1.0 -> 99%
    // Score <= -3.0 -> 10%
    const maxScore = Math.max(...msg.citations.map(c => c.score))
    if (maxScore >= 1.5) return 99
    if (maxScore <= -3) return 15
    // Linear mapping
    const percentage = Math.round(50 + (maxScore + 0.75) * 22)
    return Math.max(10, Math.min(99, percentage))
  }

  if (!token) {
    // Elegant Auth Portal
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712] relative overflow-hidden px-4">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[100px] pointer-events-none"></div>
        
        <div className="w-full max-w-md bg-[#0b0f19]/80 border border-gray-800 rounded-2xl shadow-2xl backdrop-blur-md p-8 relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mb-3">
              <Shield className="w-7 h-7 text-blue-500" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">DocuTrust</h1>
            <p className="text-gray-400 text-sm mt-1">Enterprise Self-Correcting RAG Platform</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Username</label>
              <input 
                type="text" 
                value={authUsername}
                onChange={e => setAuthUsername(e.target.value)}
                placeholder="Enter username" 
                className="w-full bg-[#111827] border border-gray-800 focus:border-blue-500 rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Password</label>
              <input 
                type="password" 
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full bg-[#111827] border border-gray-800 focus:border-blue-500 rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors"
                required
              />
            </div>

            {authError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2.5 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoadingAuth}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-semibold rounded-xl py-3 text-sm transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              {isLoadingAuth ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <span>{isLogin ? "Sign In" : "Create Account"}</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              type="button" 
              onClick={() => { setIsLogin(!isLogin); setAuthError(""); }}
              className="text-gray-400 hover:text-blue-400 text-xs transition-colors"
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-[#030712] overflow-hidden text-gray-200">
      
      {/* SIDEBAR: Chat History */}
      <div className={`bg-[#0b0f19] border-r border-gray-900 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-0 -translate-x-full md:w-16 md:translate-x-0'}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-900">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              <span className="font-bold text-white tracking-wide">DocuTrust</span>
            </div>
          ) : (
            <Shield className="w-5 h-5 text-blue-500 mx-auto" />
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 hover:bg-gray-800/50 rounded-lg text-gray-400 hover:text-white hidden md:block">
            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${sidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button 
            onClick={handleNewChat}
            className="w-full bg-[#111827] hover:bg-[#1f293d] border border-gray-800 hover:border-gray-700 text-gray-200 hover:text-white rounded-xl py-2 px-3 text-xs font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {sidebarOpen && <span>New Session</span>}
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1.5 py-1">
          {chats.map(chat => {
            const isActive = chat.chat_id === currentChatId
            return (
              <div 
                key={chat.chat_id}
                onClick={() => fetchChatDetails(chat.chat_id)}
                className={`w-full group rounded-xl p-2.5 text-left text-xs transition-colors flex items-center justify-between cursor-pointer ${isActive ? 'bg-blue-600/10 border border-blue-500/20 text-white font-medium' : 'hover:bg-gray-800/40 text-gray-400 hover:text-gray-200'}`}
              >
                <div className="flex items-center gap-2 truncate pr-1">
                  <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className="truncate">{chat.title}</span>}
                </div>
                {sidebarOpen && (
                  <button 
                    onClick={(e) => handleDeleteChat(e, chat.chat_id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-red-400 transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* User Info & Logout */}
        <div className="p-3 border-t border-gray-900 bg-[#080c14]/40">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div className="truncate pr-2">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Signed In As</p>
                <p className="text-xs text-white font-semibold truncate mt-0.5">{username}</p>
              </div>
            )}
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-xl text-gray-500 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </div>

      {/* DASHBOARD GRID: 3 PANES */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* PANE 1 (LEFT): Document Uploads & Metadata (width: 1/4) */}
        <div className="w-full md:w-64 lg:w-72 bg-[#080c14] border-r border-gray-900 flex flex-col shrink-0">
          <div className="h-14 flex items-center px-4 border-b border-gray-900">
            <Layers className="w-4 h-4 text-blue-500 mr-2" />
            <h2 className="font-semibold text-xs uppercase tracking-wider text-gray-300">Documents Library</h2>
          </div>

          {/* Upload Box */}
          <div className="p-4 border-b border-gray-900">
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border border-dashed rounded-2xl p-5 text-center transition-all ${dragActive ? 'border-blue-500 bg-blue-500/5' : 'border-gray-800 bg-[#0b0f19]/40 hover:border-gray-700'}`}
            >
              <Upload className="w-7 h-7 text-gray-500 mx-auto mb-2.5" />
              <p className="text-xs font-semibold text-gray-300 mb-0.5">Drag & Drop PDFs</p>
              <p className="text-[10px] text-gray-500 mb-3">Only PDFs supported</p>
              
              <label className="inline-block bg-[#111827] hover:bg-[#1f293d] border border-gray-800 hover:border-gray-700 text-white text-[10px] font-bold rounded-lg px-3 py-1.5 transition-colors cursor-pointer">
                Browse Files
                <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
            {isUploading && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-blue-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Indexing documents...</span>
              </div>
            )}
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {documents.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center text-center text-gray-600">
                <FileText className="w-6 h-6 mb-1.5 opacity-40" />
                <p className="text-[10px] uppercase font-bold tracking-wide">No documents</p>
                <p className="text-[10px] max-w-[150px] mt-1 leading-normal">Upload PDF files to build vector database</p>
              </div>
            ) : (
              documents.map(doc => (
                <div key={doc.doc_id} className="bg-[#0b0f19] border border-gray-800/50 rounded-xl p-2.5 flex items-center justify-between group hover:border-gray-700/60 transition-colors">
                  <div className="flex items-center gap-2 min-w-0 pr-1">
                    <FileText className="w-8 h-8 text-red-500 shrink-0 bg-red-500/10 p-1.5 rounded-lg border border-red-500/20" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-200 font-medium truncate" title={doc.filename}>{doc.filename}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5 font-medium">
                        {doc.num_pages} pages • {doc.num_chunks} chunks
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteDocument(doc.doc_id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-all shrink-0"
                    title="Remove document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PANE 2 (CENTER): Main Chat Area & Agent Logs (width: 1/2) */}
        <div className="flex-1 flex flex-col bg-[#030712] relative">
          <div className="h-14 flex items-center justify-between px-6 border-b border-gray-900 z-10 bg-[#030712]/90 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-xs uppercase tracking-wider text-gray-300">Self-Correcting Chat</span>
            </div>
            
            {/* Status alerts */}
            <div className="flex items-center gap-2.5">
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-1 px-3 text-[10px] text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl py-1 px-3 text-[10px] text-green-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{successMsg}</span>
                </div>
              )}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="w-12 h-12 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-base font-bold text-white">Trustworthy Document Assistant</h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Ask any question about your corporate policy packets. DocuTrust employs Corrective RAG (CRAG) with LangGraph to grade retrievals, self-correct queries, and generate accurate cited answers.
                </p>
                
                {documents.length === 0 && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[10px] text-amber-400 text-left leading-normal">
                    ⚠️ To get started, upload at least one PDF file in the library panel.
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg, index) => {
                const isUser = msg.role === 'user'
                const isTemp = msg.message_id.startsWith('temp')
                return (
                  <div key={msg.message_id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                        {isUser ? 'You' : 'DocuTrust Agent'}
                      </span>
                    </div>

                    <div className={`max-w-xl rounded-2xl px-4.5 py-3 text-sm leading-relaxed ${isUser ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-[#0b0f19] border border-gray-800/60 rounded-tl-none'}`}>
                      {msg.content ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        isTemp && (
                          <div className="flex items-center gap-2 py-1">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            <span className="text-gray-400 text-xs italic">Thinking...</span>
                          </div>
                        )
                      )}
                    </div>

                    {/* Agent Logs attached to Assistant response */}
                    {!isUser && msg.logs && msg.logs.length > 0 && (
                      <div className="mt-3 w-full max-w-xl bg-[#0b0f19]/40 border border-gray-800/40 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between border-b border-gray-900 pb-1.5 mb-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Settings className="w-3.5 h-3.5 text-blue-500 animate-spin-slow" />
                            Agent Logs Trace
                          </span>
                          <button 
                            onClick={() => setSelectedMessageId(msg.message_id)}
                            className={`text-[10px] font-bold transition-all px-2 py-0.5 rounded ${selectedMessageId === msg.message_id ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                          >
                            Inspect Details
                          </button>
                        </div>
                        
                        {/* Compact trace list */}
                        <div className="space-y-1.5">
                          {msg.logs.map((log, lIdx) => {
                            let icon = <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
                            if (log.status === 'success') {
                              icon = <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            } else if (log.status === 'error') {
                              icon = <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            }
                            
                            return (
                              <div key={lIdx} className="flex items-start gap-2 text-xs">
                                <div className="mt-0.5 shrink-0">{icon}</div>
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold text-gray-300">{log.agent}: </span>
                                  <span className="text-gray-400 text-[11px] leading-normal">{log.detail}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form input */}
          <div className="p-4 border-t border-gray-900 bg-[#030712]/90 backdrop-blur-sm z-10">
            <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex items-center gap-3 bg-[#0b0f19] border border-gray-800 focus-within:border-blue-500 rounded-2xl px-4 py-2.5 transition-all">
              <input 
                type="text" 
                value={inputQuestion}
                onChange={e => setInputQuestion(e.target.value)}
                disabled={isGenerating || documents.length === 0}
                placeholder={documents.length === 0 ? "Upload documents to unlock chat..." : "Ask your PDF assistant..."}
                className="flex-1 bg-transparent text-white text-sm outline-none border-none placeholder-gray-500"
              />
              <button 
                type="submit" 
                disabled={isGenerating || !inputQuestion.trim() || documents.length === 0}
                className="p-2 bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* PANE 3 (RIGHT): Citations, Sources, Confidence & Feedback (width: 1/4) */}
        <div className="w-full md:w-80 bg-[#080c14] border-t md:border-t-0 md:border-l border-gray-900 flex flex-col shrink-0 overflow-y-auto">
          <div className="h-14 flex items-center px-4 border-b border-gray-900 shrink-0">
            <BookOpen className="w-4 h-4 text-blue-500 mr-2" />
            <h2 className="font-semibold text-xs uppercase tracking-wider text-gray-300">Answer Citations</h2>
          </div>

          {!activeMessage || activeMessage.role === 'user' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-600">
              <HelpCircle className="w-6 h-6 mb-2 opacity-40" />
              <p className="text-[10px] uppercase font-bold tracking-wider">No Details</p>
              <p className="text-[10px] mt-1 leading-normal">Ask a question and inspect the generated answer sources and metrics here.</p>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              
              {/* Confidence Score Metirc */}
              <div className="bg-[#0b0f19] border border-gray-800 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Retrieval Confidence</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-extrabold text-white">{getConfidenceLevel(activeMessage)}%</span>
                  <span className="text-xs text-green-500 font-semibold">Verified</span>
                </div>
                <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-3">
                  <div 
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${getConfidenceLevel(activeMessage)}%` }}
                  />
                </div>
                <p className="text-[9px] text-gray-400 mt-2 font-medium">Verified by cross-encoder re-ranking scoring.</p>
              </div>

              {/* Source list */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Retrieved Sources</span>
                </div>

                {activeMessage.citations.length === 0 ? (
                  <p className="text-xs text-amber-500 italic p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl leading-normal">
                    This answer does not contain specific file citations (web fallback or fallback mode).
                  </p>
                ) : (
                  <div className="space-y-3">
                    {activeMessage.citations.map((cite, index) => (
                      <div key={cite.citation_number} className="bg-[#0b0f19] border border-gray-800 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold bg-blue-600/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                            Source [{cite.citation_number}]
                          </span>
                          <span className="text-[10px] text-gray-400 font-semibold truncate max-w-[120px]" title={cite.filename}>
                            {cite.filename}
                          </span>
                        </div>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">
                          Page {cite.page} • Score: {cite.score.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-300 bg-[#030712] rounded-xl p-2.5 leading-relaxed font-mono">
                          {cite.full_text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Feedback Widget */}
              <div className="border-t border-gray-900 pt-6">
                <div className="bg-[#0b0f19] border border-gray-800 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <ThumbsUp className="w-3.5 h-3.5 text-blue-500" />
                    Submit Answer Feedback
                  </p>
                  
                  {feedbackSubmitted ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center text-xs text-green-400">
                      <p className="font-semibold">Thank you for your feedback!</p>
                      <p className="text-[10px] text-gray-400 mt-1 leading-normal">Your ratings are logged to help optimize the retrieval scoring weights.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleFeedbackSubmit} className="space-y-3.5">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400 mr-2">Rating:</span>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button 
                            key={star}
                            type="button"
                            onClick={() => setFeedbackRating(star)}
                            className="p-0.5 transition-transform hover:scale-110 text-amber-400"
                          >
                            <Star className={`w-4 h-4 ${feedbackRating >= star ? 'fill-current' : 'text-gray-600'}`} />
                          </button>
                        ))}
                      </div>

                      <textarea 
                        rows="2"
                        value={feedbackComment}
                        onChange={e => setFeedbackComment(e.target.value)}
                        placeholder="Write dynamic logs comment..."
                        className="w-full bg-[#030712] border border-gray-800 focus:border-blue-500 rounded-xl p-2 text-xs text-white placeholder-gray-600 outline-none resize-none transition-colors"
                      />

                      <button 
                        type="submit"
                        disabled={!selectedMessageId || selectedMessageId.startsWith('temp')}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white text-[11px] font-bold rounded-xl py-2 transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/10"
                      >
                        Submit Logs Trace
                      </button>
                    </form>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default App
