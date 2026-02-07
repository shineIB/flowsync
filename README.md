# FlowSync 🔄

A real-time collaborative architecture whiteboard built with FastAPI, React Flow, and Redis.

<img width="800" height="397" alt="image" src="https://github.com/user-attachments/assets/61ad0ff7-aa8e-41c9-ae04-3d110c8dbcf7" />


## Features

- 🔄 **Real-time Collaboration**: See other users' changes and cursors instantly
- 📐 **Architecture Diagramming**: Create service, database, gateway, and component nodes
- 🔗 **Connection Management**: Draw edges between nodes with animated flows
- 🤖 **AI Security Analysis**: Get AI-powered security reviews of your architecture
- 🎨 **Beautiful Dark UI**: Professional design with smooth animations

## Tech Stack

- **Backend**: Python FastAPI + WebSockets
- **Frontend**: React + React Flow + Tailwind CSS
- **State Sync**: Redis Pub/Sub
- **AI**: Google Gemini (optional)
- **Infrastructure**: Docker Compose

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- (Optional) Google Gemini API key for AI analysis

### 1. Clone and Start

```bash
# Clone the repository
git clone <your-repo-url>
cd flowsync

# Start all services
docker-compose up --build
```

### 2. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### 3. Test Real-time Sync

Open http://localhost:3000 in two browser windows side-by-side. When you drag nodes in one window, they move in the other!

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Optional: Enable AI-powered security analysis
GOOGLE_API_KEY=your_gemini_api_key_here
```

### Without AI (Default)

The application works fully without a Gemini API key. The AI analysis feature will return a mock security review based on your diagram structure.

### With Google Gemini

1. Get an API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add it to your `.env` file
3. Restart the services

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (React)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  React Flow │  │  WebSocket  │  │   Tailwind CSS      │  │
│  │   Canvas    │  │   Client    │  │   + Custom Styles   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket + HTTP
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  WebSocket  │  │   Redis     │  │    Gemini API       │  │
│  │  Handler    │  │   Pub/Sub   │  │    Integration      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         Redis                                │
│              (Message Broker for Real-time Sync)             │
└─────────────────────────────────────────────────────────────┘
```

## Development

### Backend Only

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Only

```bash
cd frontend
npm install
npm run dev
```

### Run Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## WebSocket Protocol

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `welcome` | Server → Client | Connection confirmation with client ID and color |
| `client_joined` | Server → All | New client connected |
| `client_left` | Server → All | Client disconnected |
| `cursor_move` | Client ↔ Server | Mouse position update |
| `node_add` | Client ↔ Server | New node created |
| `node_move` | Client ↔ Server | Node position changed |
| `node_delete` | Client ↔ Server | Node removed |
| `edge_add` | Client ↔ Server | New connection created |
| `edge_delete` | Client ↔ Server | Connection removed |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/health` | Detailed health status |
| `POST` | `/analyze` | AI security analysis |
| `WS` | `/ws/{client_id}` | WebSocket connection |

## Portfolio Highlights

This project demonstrates:

1. **Concurrency**: WebSocket management with async/await patterns
2. **System Design**: Redis Pub/Sub for horizontal scaling
3. **Real-time Systems**: Cursor synchronization and state management
4. **AI Integration**: LLM API integration for intelligent features
5. **Modern Stack**: Docker, FastAPI, React, TypeScript-ready

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - feel free to use this for your portfolio!

---

Built with ❤️ for learning concurrency and system design.
