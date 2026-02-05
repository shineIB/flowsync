import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

// =============================================================================
// Configuration
// =============================================================================

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Generate a unique client ID
const generateClientId = () => {
  const stored = sessionStorage.getItem('flowsync_client_id');
  if (stored) return stored;
  const id = `user_${Math.random().toString(36).substring(2, 9)}`;
  sessionStorage.setItem('flowsync_client_id', id);
  return id;
};

const CLIENT_ID = generateClientId();

// =============================================================================
// Initial Nodes and Edges
// =============================================================================

const initialNodes = [
  {
    id: 'gateway-1',
    type: 'gateway',
    position: { x: 250, y: 50 },
    data: { label: 'API Gateway' },
  },
  {
    id: 'service-1',
    type: 'service',
    position: { x: 100, y: 180 },
    data: { label: 'Auth Service' },
  },
  {
    id: 'service-2',
    type: 'service',
    position: { x: 400, y: 180 },
    data: { label: 'User Service' },
  },
  {
    id: 'database-1',
    type: 'database',
    position: { x: 250, y: 320 },
    data: { label: 'PostgreSQL' },
  },
];

const initialEdges = [
  { 
    id: 'e1-1', 
    source: 'gateway-1', 
    target: 'service-1',
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
  },
  { 
    id: 'e1-2', 
    source: 'gateway-1', 
    target: 'service-2',
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
  },
  { 
    id: 'e2-1', 
    source: 'service-1', 
    target: 'database-1',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  { 
    id: 'e2-2', 
    source: 'service-2', 
    target: 'database-1',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

// =============================================================================
// Custom Node Components
// =============================================================================

const CustomNode = ({ data, type, selected }) => {
  const icons = {
    default: '📦',
    service: '⚙️',
    database: '🗄️',
    gateway: '🌐',
  };
  
  return (
    <div className={`custom-node ${type} ${selected ? 'selected' : ''}`}>
      <div className="flex items-center gap-2 justify-center">
        <span>{icons[type] || icons.default}</span>
        <span>{data.label}</span>
      </div>
    </div>
  );
};

const nodeTypes = {
  default: (props) => <CustomNode {...props} type="default" />,
  service: (props) => <CustomNode {...props} type="service" />,
  database: (props) => <CustomNode {...props} type="database" />,
  gateway: (props) => <CustomNode {...props} type="gateway" />,
};

// =============================================================================
// Remote Cursor Component
// =============================================================================

const RemoteCursor = ({ x, y, color, clientId }) => {
  return (
    <div 
      className="remote-cursor"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <div className="cursor-pointer" style={{ color }} />
      <div className="cursor-label" style={{ backgroundColor: color }}>
        {clientId.replace('user_', '')}
      </div>
    </div>
  );
};

// =============================================================================
// Toolbar Component
// =============================================================================

const Toolbar = ({ onAddNode, connectionStatus, clientCount }) => {
  const nodeTemplates = [
    { type: 'default', label: 'Component', icon: '📦' },
    { type: 'service', label: 'Service', icon: '⚙️' },
    { type: 'database', label: 'Database', icon: '🗄️' },
    { type: 'gateway', label: 'Gateway', icon: '🌐' },
  ];

  return (
    <Panel position="top-left" className="flex gap-2 items-center">
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg p-2 flex gap-2 items-center">
        {nodeTemplates.map((template) => (
          <button
            key={template.type}
            onClick={() => onAddNode(template.type, template.label)}
            className="px-3 py-2 rounded-md bg-[#1a1a1a] hover:bg-[#252525] 
                       text-sm font-medium transition-all duration-150
                       flex items-center gap-2 border border-transparent
                       hover:border-[#2a2a2a]"
            title={`Add ${template.label}`}
          >
            <span>{template.icon}</span>
            <span className="hidden sm:inline">{template.label}</span>
          </button>
        ))}
      </div>
      
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg px-3 py-2 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div 
            className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' 
                ? 'bg-green-500 animate-pulse' 
                : connectionStatus === 'connecting'
                ? 'bg-yellow-500 animate-pulse'
                : 'bg-red-500'
            }`} 
          />
          <span className="text-xs text-gray-400 font-mono">
            {connectionStatus}
          </span>
        </div>
        <div className="text-xs text-gray-500">|</div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">👥</span>
          <span className="text-xs text-gray-400 font-mono">{clientCount}</span>
        </div>
      </div>
    </Panel>
  );
};

// =============================================================================
// Analysis Panel Component
// =============================================================================

const AnalysisPanel = ({ analysis, isLoading, onClose, onAnalyze }) => {
  // Simple markdown-like parsing
  const formatAnalysis = (text) => {
    if (!text) return null;
    
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) {
        return <h2 key={i}>{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i}>{line.replace('### ', '')}</h3>;
      }
      if (line.startsWith('- ')) {
        return <li key={i}>{line.replace('- ', '')}</li>;
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i}><strong>{line.replace(/\*\*/g, '')}</strong></p>;
      }
      if (line.trim() === '---') {
        return <hr key={i} className="border-[#2a2a2a] my-3" />;
      }
      if (line.trim()) {
        // Handle inline bold
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={i}>
            {parts.map((part, j) => 
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j}>{part.replace(/\*\*/g, '')}</strong>
                : part
            )}
          </p>
        );
      }
      return null;
    });
  };

  return (
    <div className="analysis-panel absolute bottom-4 right-4 w-96 max-h-[70vh] 
                    bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl shadow-2xl
                    flex flex-col overflow-hidden z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-semibold text-sm">AI Security Analysis</span>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors p-1"
        >
          ✕
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent 
                          rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Analyzing architecture...</p>
          </div>
        ) : analysis ? (
          <div className="analysis-content text-sm text-gray-300">
            {formatAnalysis(analysis)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <span className="text-4xl">🔍</span>
            <p className="text-sm text-gray-400 text-center">
              Click the button below to analyze your architecture for security vulnerabilities.
            </p>
            <button
              onClick={onAnalyze}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 
                       rounded-lg text-sm font-medium transition-all"
            >
              Run Analysis
            </button>
          </div>
        )}
      </div>
      
      {analysis && (
        <div className="px-4 py-3 border-t border-[#1f1f1f]">
          <button
            onClick={onAnalyze}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 
                     disabled:opacity-50 disabled:cursor-not-allowed
                     rounded-lg text-sm font-medium transition-all"
          >
            Re-analyze
          </button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Main Flow Component
// =============================================================================

const FlowCanvas = () => {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [cursors, setCursors] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [clientCount, setClientCount] = useState(1);
  const [myColor, setMyColor] = useState('#6366f1');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const { project } = useReactFlow();
  
  // Track if we're currently processing a remote update
  const isRemoteUpdate = useRef(false);

  // ==========================================================================
  // WebSocket Connection
  // ==========================================================================
  
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setConnectionStatus('connecting');
    const ws = new WebSocket(`${WS_URL}/ws/${CLIENT_ID}`);
    
    ws.onopen = () => {
      console.log('✓ WebSocket connected');
      setConnectionStatus('connected');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
    
    ws.onclose = () => {
      console.log('✗ WebSocket disconnected');
      setConnectionStatus('disconnected');
      // Attempt to reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
    
    wsRef.current = ws;
  }, []);

  // Connect on mount
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  // ==========================================================================
  // WebSocket Message Handler
  // ==========================================================================
  
  const handleWebSocketMessage = useCallback((data) => {
    const { type, client_id, color } = data;
    
    // Ignore our own messages
    if (client_id === CLIENT_ID) return;
    
    switch (type) {
      case 'welcome':
        setMyColor(data.color);
        setClientCount(data.connected_clients?.length || 1);
        break;
        
      case 'client_joined':
        setClientCount(data.total_clients);
        break;
        
      case 'client_left':
        setClientCount(data.total_clients);
        // Remove cursor for disconnected client
        setCursors(prev => {
          const next = { ...prev };
          delete next[client_id];
          return next;
        });
        break;
        
      case 'cursor_move':
        setCursors(prev => ({
          ...prev,
          [client_id]: { x: data.x, y: data.y, color }
        }));
        break;
        
      case 'node_add':
        isRemoteUpdate.current = true;
        setNodes(prev => {
          // Check if node already exists
          if (prev.find(n => n.id === data.node.id)) return prev;
          return [...prev, data.node];
        });
        isRemoteUpdate.current = false;
        break;
        
      case 'node_move':
        isRemoteUpdate.current = true;
        setNodes(prev => prev.map(node => 
          node.id === data.id 
            ? { ...node, position: data.position }
            : node
        ));
        isRemoteUpdate.current = false;
        break;
        
      case 'node_update':
        isRemoteUpdate.current = true;
        setNodes(prev => prev.map(node =>
          node.id === data.id
            ? { ...node, data: { ...node.data, ...data.data } }
            : node
        ));
        isRemoteUpdate.current = false;
        break;
        
      case 'node_delete':
        isRemoteUpdate.current = true;
        setNodes(prev => prev.filter(n => n.id !== data.id));
        setEdges(prev => prev.filter(e => 
          e.source !== data.id && e.target !== data.id
        ));
        isRemoteUpdate.current = false;
        break;
        
      case 'edge_add':
        isRemoteUpdate.current = true;
        setEdges(prev => {
          if (prev.find(e => e.id === data.edge.id)) return prev;
          return [...prev, data.edge];
        });
        isRemoteUpdate.current = false;
        break;
        
      case 'edge_delete':
        isRemoteUpdate.current = true;
        setEdges(prev => prev.filter(e => e.id !== data.id));
        isRemoteUpdate.current = false;
        break;
        
      default:
        console.log('Unknown message type:', type);
    }
  }, []);

  // ==========================================================================
  // Send WebSocket Message
  // ==========================================================================
  
  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // ==========================================================================
  // Mouse Move Handler (for cursor sync)
  // ==========================================================================
  
  const throttleRef = useRef(null);
  
  const handleMouseMove = useCallback((event) => {
    if (throttleRef.current) return;
    
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
    }, 50); // Throttle to 20 updates per second
    
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    
    sendMessage({
      type: 'cursor_move',
      x: position.x,
      y: position.y,
    });
  }, [project, sendMessage]);

  // ==========================================================================
  // Node Change Handlers
  // ==========================================================================
  
  const onNodesChange = useCallback((changes) => {
    // Apply changes locally
    setNodes((nds) => applyNodeChanges(changes, nds));
    
    // Don't broadcast remote updates back
    if (isRemoteUpdate.current) return;
    
    // Broadcast position changes to other clients
    changes.forEach(change => {
      if (change.type === 'position' && change.position) {
        sendMessage({
          type: 'node_move',
          id: change.id,
          position: change.position,
        });
      }
      if (change.type === 'remove') {
        sendMessage({
          type: 'node_delete',
          id: change.id,
        });
      }
    });
  }, [sendMessage]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    
    if (isRemoteUpdate.current) return;
    
    changes.forEach(change => {
      if (change.type === 'remove') {
        sendMessage({
          type: 'edge_delete',
          id: change.id,
        });
      }
    });
  }, [sendMessage]);

  const onConnect = useCallback((connection) => {
    const newEdge = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      markerEnd: { type: MarkerType.ArrowClosed },
    };
    
    setEdges((eds) => addEdge(newEdge, eds));
    
    sendMessage({
      type: 'edge_add',
      edge: newEdge,
    });
  }, [sendMessage]);

  // ==========================================================================
  // Add Node Handler
  // ==========================================================================
  
  const onAddNode = useCallback((nodeType, label) => {
    const newNode = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position: { 
        x: Math.random() * 400 + 100, 
        y: Math.random() * 300 + 100 
      },
      data: { label },
    };
    
    setNodes(prev => [...prev, newNode]);
    
    sendMessage({
      type: 'node_add',
      node: newNode,
    });
  }, [sendMessage]);

  // ==========================================================================
  // AI Analysis Handler
  // ==========================================================================
  
  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setShowAnalysis(true);
    
    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nodes, edges }),
      });
      
      if (!response.ok) {
        throw new Error('Analysis failed');
      }
      
      const data = await response.json();
      setAnalysis(data.analysis);
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysis('❌ **Analysis Failed**\n\nCould not connect to the analysis service. Please ensure the backend is running.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [nodes, edges]);

  // ==========================================================================
  // Render
  // ==========================================================================
  
  return (
    <div className="w-screen h-screen bg-[#080808]" onMouseMove={handleMouseMove}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          style: { stroke: '#404040', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background 
          variant="dots" 
          gap={20} 
          size={1} 
          color="#1a1a1a"
        />
        <Controls showInteractive={false} />
        <MiniMap 
          nodeStrokeWidth={3}
          nodeColor={(node) => {
            switch (node.type) {
              case 'service': return '#22c55e';
              case 'database': return '#ef4444';
              case 'gateway': return '#f59e0b';
              default: return '#6366f1';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
        />
        
        <Toolbar 
          onAddNode={onAddNode}
          connectionStatus={connectionStatus}
          clientCount={clientCount}
        />
        
        {/* AI Analyze Button */}
        <Panel position="top-right">
          <button
            onClick={() => setShowAnalysis(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 
                     hover:from-indigo-500 hover:to-purple-500
                     rounded-lg text-sm font-semibold transition-all duration-200
                     flex items-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            <span>🤖</span>
            <span>AI Analyze</span>
          </button>
        </Panel>
        
        {/* Header */}
        <Panel position="top-center">
          <div className="flex items-center gap-3 bg-[#0f0f0f]/80 backdrop-blur-sm 
                        border border-[#1f1f1f] rounded-lg px-4 py-2">
            <span className="text-xl">🔄</span>
            <div>
              <h1 className="text-sm font-bold tracking-tight">FlowSync</h1>
              <p className="text-[10px] text-gray-500 font-mono">
                Client: {CLIENT_ID.replace('user_', '')}
              </p>
            </div>
          </div>
        </Panel>
        
        {/* Remote Cursors */}
        {Object.entries(cursors).map(([clientId, cursor]) => (
          <RemoteCursor
            key={clientId}
            x={cursor.x}
            y={cursor.y}
            color={cursor.color}
            clientId={clientId}
          />
        ))}
      </ReactFlow>
      
      {/* Analysis Panel */}
      {showAnalysis && (
        <AnalysisPanel
          analysis={analysis}
          isLoading={isAnalyzing}
          onClose={() => setShowAnalysis(false)}
          onAnalyze={handleAnalyze}
        />
      )}
      
      {/* Keyboard Shortcuts Help */}
      <div className="fixed bottom-4 left-4 text-[10px] text-gray-600 font-mono
                    bg-[#0f0f0f]/50 backdrop-blur-sm rounded-lg px-3 py-2
                    border border-[#1f1f1f]/50">
        <span className="text-gray-500">Delete:</span> Backspace &nbsp;|&nbsp;
        <span className="text-gray-500">Connect:</span> Drag from handles &nbsp;|&nbsp;
        <span className="text-gray-500">Pan:</span> Drag canvas
      </div>
    </div>
  );
};

// =============================================================================
// App Wrapper with Provider
// =============================================================================

const App = () => {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
};

export default App;
