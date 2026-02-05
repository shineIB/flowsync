"""
FlowSync Backend - Real-time Collaborative Architecture Whiteboard
"""
import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Dict, Set, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis.asyncio as redis

# Optional: Google Gemini integration
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


# =============================================================================
# Configuration
# =============================================================================

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
CHANNEL_NAME = "flowsync:broadcast"


# =============================================================================
# Connection Manager with Redis Pub/Sub
# =============================================================================

class ConnectionManager:
    """
    Manages WebSocket connections and broadcasts messages using Redis Pub/Sub.
    This allows horizontal scaling across multiple backend instances.
    """
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.client_colors: Dict[str, str] = {}
        self.redis_client: Optional[redis.Redis] = None
        self.pubsub: Optional[redis.client.PubSub] = None
        self._listener_task: Optional[asyncio.Task] = None
        
        # Predefined colors for client cursors
        self.colors = [
            "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", 
            "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
            "#BB8FCE", "#85C1E9", "#F8B500", "#00CED1"
        ]
        self._color_index = 0
    
    async def connect_redis(self):
        """Initialize Redis connection and start listening for broadcasts."""
        self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        self.pubsub = self.redis_client.pubsub()
        await self.pubsub.subscribe(CHANNEL_NAME)
        self._listener_task = asyncio.create_task(self._redis_listener())
        print(f"✓ Connected to Redis at {REDIS_URL}")
    
    async def disconnect_redis(self):
        """Clean up Redis connections."""
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self.pubsub:
            await self.pubsub.unsubscribe(CHANNEL_NAME)
            await self.pubsub.close()
        if self.redis_client:
            await self.redis_client.close()
    
    async def _redis_listener(self):
        """Listen for messages from Redis and broadcast to local WebSocket clients."""
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    sender_id = data.get("sender_id")
                    # Broadcast to all clients except the sender
                    await self._local_broadcast(data, exclude=sender_id)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Redis listener error: {e}")
    
    async def _local_broadcast(self, data: dict, exclude: str = None):
        """Send message to all locally connected WebSocket clients."""
        disconnected = []
        for client_id, websocket in self.active_connections.items():
            if client_id != exclude:
                try:
                    await websocket.send_json(data)
                except Exception:
                    disconnected.append(client_id)
        
        # Clean up disconnected clients
        for client_id in disconnected:
            self.disconnect(client_id)
    
    def _get_next_color(self) -> str:
        """Assign a color to a new client."""
        color = self.colors[self._color_index % len(self.colors)]
        self._color_index += 1
        return color
    
    async def connect(self, client_id: str, websocket: WebSocket):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.client_colors[client_id] = self._get_next_color()
        
        # Notify all clients about the new connection
        await self.broadcast({
            "type": "client_joined",
            "client_id": client_id,
            "color": self.client_colors[client_id],
            "total_clients": len(self.active_connections),
            "timestamp": datetime.utcnow().isoformat()
        }, sender_id=client_id)
        
        # Send current state to the new client
        await websocket.send_json({
            "type": "welcome",
            "client_id": client_id,
            "color": self.client_colors[client_id],
            "connected_clients": list(self.active_connections.keys()),
            "client_colors": self.client_colors
        })
        
        print(f"✓ Client {client_id} connected. Total: {len(self.active_connections)}")
    
    def disconnect(self, client_id: str):
        """Remove a WebSocket connection."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if client_id in self.client_colors:
            del self.client_colors[client_id]
        print(f"✗ Client {client_id} disconnected. Total: {len(self.active_connections)}")
    
    async def broadcast(self, data: dict, sender_id: str = None):
        """Broadcast message to all clients via Redis Pub/Sub."""
        data["sender_id"] = sender_id
        if self.redis_client:
            await self.redis_client.publish(CHANNEL_NAME, json.dumps(data))
        else:
            # Fallback to local broadcast if Redis is not available
            await self._local_broadcast(data, exclude=sender_id)


# =============================================================================
# FastAPI Application
# =============================================================================

manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown."""
    # Startup
    await manager.connect_redis()
    
    # Configure Gemini if API key is available
    if GEMINI_AVAILABLE and GOOGLE_API_KEY:
        genai.configure(api_key=GOOGLE_API_KEY)
        print("✓ Google Gemini configured")
    else:
        print("⚠ Google Gemini not configured (no API key)")
    
    yield
    
    # Shutdown
    await manager.disconnect_redis()


app = FastAPI(
    title="FlowSync API",
    description="Real-time collaborative architecture whiteboard backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Pydantic Models
# =============================================================================

class NodeData(BaseModel):
    id: str
    type: str = "default"
    position: dict
    data: dict


class DiagramData(BaseModel):
    nodes: list[dict]
    edges: list[dict]


class AnalyzeResponse(BaseModel):
    analysis: str
    timestamp: str


# =============================================================================
# WebSocket Endpoint
# =============================================================================

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket endpoint for real-time collaboration.
    
    Message Types:
    - node_add: Add a new node to the canvas
    - node_move: Move an existing node
    - node_update: Update node data
    - node_delete: Delete a node
    - edge_add: Add a new edge
    - edge_delete: Delete an edge
    - cursor_move: Update cursor position
    """
    await manager.connect(client_id, websocket)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            # Add metadata to the message
            data["client_id"] = client_id
            data["color"] = manager.client_colors.get(client_id, "#888888")
            data["timestamp"] = datetime.utcnow().isoformat()
            
            # Log the event (useful for debugging)
            print(f"← [{client_id}] {message_type}: {data.get('id', 'N/A')}")
            
            # Broadcast to all other clients
            await manager.broadcast(data, sender_id=client_id)
            
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        # Notify other clients about the disconnection
        await manager.broadcast({
            "type": "client_left",
            "client_id": client_id,
            "total_clients": len(manager.active_connections),
            "timestamp": datetime.utcnow().isoformat()
        }, sender_id=client_id)


# =============================================================================
# HTTP Endpoints
# =============================================================================

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "FlowSync API",
        "status": "running",
        "connected_clients": len(manager.active_connections),
        "redis_connected": manager.redis_client is not None,
        "gemini_configured": GEMINI_AVAILABLE and bool(GOOGLE_API_KEY)
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    redis_ok = False
    if manager.redis_client:
        try:
            await manager.redis_client.ping()
            redis_ok = True
        except Exception:
            pass
    
    return {
        "status": "healthy" if redis_ok else "degraded",
        "redis": "connected" if redis_ok else "disconnected",
        "websocket_clients": len(manager.active_connections)
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_diagram(diagram: DiagramData):
    """
    Analyze the architecture diagram using Google Gemini.
    
    Sends the diagram structure to Gemini and returns a security review
    with recommendations.
    """
    if not GEMINI_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Google Gemini SDK not installed"
        )
    
    if not GOOGLE_API_KEY:
        # Return a mock analysis if no API key is configured
        return AnalyzeResponse(
            analysis=generate_mock_analysis(diagram),
            timestamp=datetime.utcnow().isoformat()
        )
    
    try:
        # Prepare the diagram description for Gemini
        diagram_description = format_diagram_for_analysis(diagram)
        
        # Create the prompt for security analysis
        prompt = f"""You are a senior security architect reviewing a system architecture diagram.

Analyze the following architecture and provide:
1. **Security Assessment**: Identify potential vulnerabilities and security concerns
2. **Best Practices**: Recommend security improvements
3. **Compliance Notes**: Mention any compliance considerations (GDPR, SOC2, etc.)
4. **Risk Rating**: Provide an overall risk rating (Low/Medium/High)

Keep your response concise but actionable. Format with clear sections.

Architecture Diagram:
{diagram_description}
"""
        
        # Call Gemini API
        model = genai.GenerativeModel('gemini-pro')
        response = await asyncio.to_thread(
            model.generate_content, prompt
        )
        
        return AnalyzeResponse(
            analysis=response.text,
            timestamp=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        print(f"Gemini API error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )


def format_diagram_for_analysis(diagram: DiagramData) -> str:
    """Format the diagram data into a readable description for the AI."""
    lines = ["## Nodes (Components):"]
    
    for node in diagram.nodes:
        node_type = node.get("type", "default")
        label = node.get("data", {}).get("label", "Unnamed")
        node_id = node.get("id", "unknown")
        lines.append(f"- [{node_type}] {label} (id: {node_id})")
    
    lines.append("\n## Edges (Connections):")
    
    for edge in diagram.edges:
        source = edge.get("source", "?")
        target = edge.get("target", "?")
        label = edge.get("label", "connects to")
        lines.append(f"- {source} --{label}--> {target}")
    
    if not diagram.edges:
        lines.append("- No connections defined")
    
    return "\n".join(lines)


def generate_mock_analysis(diagram: DiagramData) -> str:
    """Generate a mock analysis when Gemini API is not available."""
    node_count = len(diagram.nodes)
    edge_count = len(diagram.edges)
    
    # Extract node types for analysis
    node_types = {}
    for node in diagram.nodes:
        ntype = node.get("type", "default")
        node_types[ntype] = node_types.get(ntype, 0) + 1
    
    # Check for common patterns
    has_database = any("database" in str(n).lower() or "db" in str(n).lower() 
                       for n in diagram.nodes)
    has_api = any("api" in str(n).lower() or "gateway" in str(n).lower() 
                  for n in diagram.nodes)
    
    analysis = f"""## 🔒 Security Analysis Report

**Architecture Overview:**
- Total Components: {node_count}
- Total Connections: {edge_count}
- Component Types: {', '.join(f'{k}: {v}' for k, v in node_types.items()) or 'Default nodes'}

---

### 1. Security Assessment

"""
    
    if node_count == 0:
        analysis += "⚠️ **Empty Architecture**: No components to analyze. Add nodes to your diagram.\n\n"
    else:
        if has_database:
            analysis += """✅ **Database Detected**: Ensure proper encryption at rest and in transit.
   - Recommendation: Use TLS 1.3 for connections
   - Enable audit logging for all database access

"""
        if has_api:
            analysis += """✅ **API/Gateway Detected**: Implement proper authentication.
   - Recommendation: Use OAuth 2.0 or JWT tokens
   - Add rate limiting to prevent DDoS attacks

"""
        if edge_count == 0 and node_count > 1:
            analysis += """⚠️ **Isolated Components**: Multiple nodes without connections may indicate:
   - Incomplete architecture diagram
   - Potential security silos (can be good or bad)

"""

    analysis += f"""### 2. Best Practices Recommendations

1. **Network Segmentation**: Ensure proper VPC/subnet isolation
2. **Authentication**: Implement MFA for all user-facing components
3. **Monitoring**: Add centralized logging (ELK/Splunk)
4. **Secrets Management**: Use HashiCorp Vault or AWS Secrets Manager

### 3. Compliance Notes

- **GDPR**: Ensure data processing consent and right to deletion
- **SOC2**: Implement access controls and audit trails
- **HIPAA**: If handling PHI, ensure encryption and access logging

### 4. Risk Rating

**Overall Risk: {'HIGH' if node_count > 0 and edge_count == 0 else 'MEDIUM' if node_count < 5 else 'LOW'}**

{'⚠️ Architecture appears incomplete. Add connections between components.' if edge_count == 0 and node_count > 1 else '✅ Architecture shows proper component connectivity.' if edge_count > 0 else ''}

---
*Note: This is a demo analysis. Connect your Google Gemini API key for AI-powered insights.*
"""
    
    return analysis


# =============================================================================
# Run with: uvicorn main:app --reload
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
