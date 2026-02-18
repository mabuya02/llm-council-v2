.PHONY: dev backend frontend install install-backend install-frontend clean help

# Default target
help:
	@echo "LLM Council"
	@echo ""
	@echo "Usage:"
	@echo "  make dev              Start backend + frontend together"
	@echo "  make backend          Start backend only (port 8001)"
	@echo "  make frontend         Start frontend only (port 5173)"
	@echo "  make install          Install all dependencies"
	@echo "  make install-backend  Install Python dependencies"
	@echo "  make install-frontend Install Node dependencies"
	@echo "  make clean            Remove build artifacts"
	@echo ""

# Start both servers
dev:
	@echo "Starting LLM Council..."
	@trap 'kill 0' SIGINT SIGTERM; \
	uv run uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload & \
	sleep 2 && cd frontend && npm run dev & \
	echo "" && \
	echo "✓ LLM Council is running!" && \
	echo "  Backend:  http://localhost:8001" && \
	echo "  Frontend: http://localhost:5173" && \
	echo "" && \
	echo "Press Ctrl+C to stop both servers" && \
	wait

# Start backend only
backend:
	uv run uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload

# Start frontend only
frontend:
	cd frontend && npm run dev

# Install all dependencies
install: install-backend install-frontend

install-backend:
	uv sync

install-frontend:
	cd frontend && npm install

# Clean build artifacts
clean:
	rm -rf __pycache__ backend/__pycache__
	rm -rf frontend/dist frontend/.vite frontend/node_modules/.vite
