#!/bin/bash

# DocuTrust Startup Helper Script

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Starting DocuTrust Platform ===${NC}\n"

# 1. Check MongoDB
echo -e "${YELLOW}[1/3] Checking MongoDB container...${NC}"
if [ "$(docker ps -q -f name=docutrust-mongo)" ]; then
    echo -e "${GREEN}✓ MongoDB container (docutrust-mongo) is already running.${NC}"
elif [ "$(docker ps -a -q -f name=docutrust-mongo)" ]; then
    echo -e "${YELLOW}Starting existing MongoDB container...${NC}"
    docker start docutrust-mongo
    echo -e "${GREEN}✓ MongoDB container started.${NC}"
else
    echo -e "${YELLOW}Provisioning new MongoDB container on port 27017...${NC}"
    docker run -d -p 27017:27017 --name docutrust-mongo mongo:latest
    echo -e "${GREEN}✓ MongoDB container created and started.${NC}"
fi

# 2. Start Backend
echo -e "\n${YELLOW}[2/3] Starting FastAPI Backend...${NC}"
cd backend
if [ -z "$GROQ_API_KEY" ]; then
    echo -e "${RED}Error: GROQ_API_KEY environment variable is not set.${NC}"
    echo -e "Please export it first: export GROQ_API_KEY='your_key'"
    exit 1
fi

PYTHONPATH=src uv run python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ FastAPI Backend started in background (PID: $BACKEND_PID, logs: backend/backend.log)${NC}"

# 3. Start Frontend
echo -e "\n${YELLOW}[3/3] Starting React Frontend...${NC}"
cd ../frontend
export PATH="/home/mohsinkhan/.gemini/antigravity/scratch/node/bin:$PATH"

npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓ React Frontend started in background (PID: $FRONTEND_PID, logs: frontend/frontend.log)${NC}"

echo -e "\n${GREEN}=== DocuTrust Platform is Running! ===${NC}"
echo -e "Frontend: ${BLUE}http://localhost:5173${NC}"
echo -e "Backend API Docs: ${BLUE}http://localhost:8000/docs${NC}"
echo -e "To stop all processes, run: ${YELLOW}kill $BACKEND_PID $FRONTEND_PID${NC}"

# Wait for Ctrl+C to terminate background processes
cleanup() {
    echo -e "\n${YELLOW}Stopping background servers...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}Servers stopped. Goodbye!${NC}"
    exit 0
}

trap cleanup SIGINT

# Keep script running to show logs/monitor
echo -e "\nPress ${YELLOW}Ctrl+C${NC} to stop the servers."
while true; do
    sleep 1
done
