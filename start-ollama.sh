#!/bin/bash
# Start Ollama for Discord Intro Agent
# This script installs Ollama if needed, starts the server, and pulls the required model

set -e

MODEL="llama3.1:8b"
OLLAMA_PORT=11434

echo "🦙 Setting up Ollama..."

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "📦 Ollama not found, installing..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "✅ Ollama is already installed"
fi

# Check if Ollama is already running
if curl -s http://127.0.0.1:$OLLAMA_PORT/api/tags &> /dev/null; then
    echo "✅ Ollama is already running"
else
    echo "🚀 Starting Ollama server..."
    nohup ollama serve &> /tmp/ollama.log &
    
    # Wait for Ollama to be ready
    echo "⏳ Waiting for Ollama to be ready..."
    for i in {1..30}; do
        if curl -s http://127.0.0.1:$OLLAMA_PORT/api/tags &> /dev/null; then
            echo "✅ Ollama is ready"
            break
        fi
        sleep 1
    done
fi

# Check if model is already downloaded
if ollama list | grep -q "$MODEL"; then
    echo "✅ Model $MODEL is already available"
else
    echo "📥 Pulling model $MODEL..."
    ollama pull $MODEL
    echo "✅ Model $MODEL is ready"
fi

echo "🦙 Ollama setup complete!"
echo "   Model: $MODEL"
echo "   API: http://127.0.0.1:$OLLAMA_PORT"
echo "   Logs: /tmp/ollama.log"
