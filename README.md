# MCP Memory Server with Qdrant Persistence (Enhanced for Claude Code)
[![smithery badge](https://smithery.ai/badge/@delorenj/mcp-qdrant-memory)](https://smithery.ai/server/@delorenj/mcp-qdrant-memory)

This MCP server provides a knowledge graph implementation with semantic search capabilities powered by Qdrant vector database. **Enhanced version** with direct Qdrant integration for Claude Code memory solution.

## ✨ Latest Enhancements - v2.4.1 Semantic Scope Architecture

- **🚀 Progressive Disclosure**: `search_similar` returns metadata-first for 90% faster queries
- **🎯 Semantic Scope Implementation**: `get_implementation(entityName, scope?)` with contextual code retrieval
  - **`minimal`**: Just the entity implementation (default, backward compatible)
  - **`logical`**: Entity + helper functions/classes from same file (analyzes calls + `_` prefixed helpers)
  - **`dependencies`**: Entity + imported modules and called functions (cross-file relationships)
- **🧠 Smart Metadata Usage**: Leverages structured semantic metadata from indexing process
- **⚡ Performance Optimized**: Configurable limits (20 logical, 30 dependencies) with smart deduplication
- **🎯 Automatic Provider Detection**: Reads embedding provider from environment variables
- **🚀 Voyage AI Integration**: Built-in support for voyage-3-lite with cost optimization
- **🛡️ Backward Compatibility**: Seamlessly handles both v2.3 and v2.4 chunk formats
- **🎯 Smart Filtering**: read_graph now provides intelligent, token-limited responses
- **🔧 Multiple Modes**: smart/entities/relationships/raw modes for different use cases
- **⚡ Priority Scoring**: Surfaces most important code first (public APIs, documented code)
- **📊 Structured Responses**: Summary, API surface, dependencies, and file structure
- **🛡️ Token Management**: Smart mode guarantees <25k tokens vs previous 393k overflow
- **🔄 Direct Qdrant Integration**: Works seamlessly with claude-indexer direct writes
- **📈 Large Collection Support**: Handles 2000+ vectors efficiently via scroll API

## Features

- Graph-based knowledge representation with entities and relations
- **Dual persistence**: Qdrant vector database + JSON file fallback
- Semantic search using Qdrant vector database
- OpenAI embeddings for semantic similarity
- HTTPS support with reverse proxy compatibility
- Docker support for easy deployment
- **Enhanced read_graph**: Direct database reads with automatic fallback

## Environment Variables

The following environment variables are required:

```bash
# Embedding Provider Configuration (v2.4)
# OpenAI API key (default provider)
OPENAI_API_KEY=your-openai-api-key

# Voyage AI API key (recommended - 85% cost reduction)
VOYAGE_API_KEY=your-voyage-key
EMBEDDING_PROVIDER=voyage
EMBEDDING_MODEL=voyage-3-lite

# Qdrant server URL (supports both HTTP and HTTPS)
QDRANT_URL=https://your-qdrant-server

# Qdrant API key (if authentication is enabled)
QDRANT_API_KEY=your-qdrant-api-key

# Name of the Qdrant collection to use
QDRANT_COLLECTION_NAME=your-collection-name
```

## Setup

### Local Setup

1. Install dependencies:
```bash
npm install
```

2. Build the server:
```bash
npm run build
```

### Docker Setup

1. Build the Docker image:
```bash
docker build -t mcp-qdrant-memory .
```

2. Run the Docker container with required environment variables:
```bash
docker run -d \
  -e OPENAI_API_KEY=your-openai-api-key \
  -e QDRANT_URL=http://your-qdrant-server:6333 \
  -e QDRANT_COLLECTION_NAME=your-collection-name \
  -e QDRANT_API_KEY=your-qdrant-api-key \
  --name mcp-qdrant-memory \
  mcp-qdrant-memory
```

### Add to MCP settings:
```json
{
  "mcpServers": {
    "memory": {
      "command": "/bin/zsh",
      "args": ["-c", "cd /path/to/server && node dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "QDRANT_API_KEY": "your-qdrant-api-key",
        "QDRANT_URL": "http://your-qdrant-server:6333",
        "QDRANT_COLLECTION_NAME": "your-collection-name"
      },
      "alwaysAllow": [
        "create_entities",
        "create_relations",
        "add_observations",
        "delete_entities",
        "delete_observations",
        "delete_relations",
        "read_graph",
        "search_similar",
        "get_implementation"
      ]
    }
  }
}
```

## Tools

### Entity Management
- `create_entities`: Create multiple new entities
- `create_relations`: Create relations between entities
- `add_observations`: Add observations to entities
- `delete_entities`: Delete entities and their relations
- `delete_observations`: Delete specific observations
- `delete_relations`: Delete specific relations
- `read_graph`: **Enhanced** - Get smart, filtered knowledge graph with token limits

### Progressive Disclosure Search (v2.4)
- `search_similar`: **Enhanced** - Metadata-first search for 90% faster queries
  ```typescript
  interface SearchParams {
    query: string;           // Search query text
    limit?: number;          // Max results (default: 10)
  }
  ```

- `get_implementation`: **ENHANCED** - Semantic scope implementation access (v2.4.1)
  ```typescript
  interface ImplementationParams {
    entityName: string;              // Name of entity to get implementation details for
    scope?: 'minimal' | 'logical' | 'dependencies';  // Scope of related code (default: 'minimal')
  }
  ```
  
  **Scope Types:**
  - **`minimal`** (default): Returns only the requested entity's implementation
  - **`logical`**: Returns entity + helper functions/classes from same file (analyzes calls + `_` prefixed helpers)
  - **`dependencies`**: Returns entity + imported modules and called functions (cross-file relationships)
  
  **Usage Examples:**
  ```typescript
  // Get just the parseAST function implementation
  await get_implementation("parseAST")
  
  // Get parseAST + its same-file helpers (_extract_nodes, _validate_syntax)
  await get_implementation("parseAST", "logical")
  
  // Get parseAST + external dependencies (TreeSitter.parse, ast.walk, etc.)
  await get_implementation("parseAST", "dependencies")
  ```

## Implementation Details

The server maintains enhanced dual storage with Qdrant as primary:

1. **Qdrant Vector DB (Primary)**:
   - Semantic embeddings of entities and relations
   - Complete knowledge graph storage
   - **Enhanced read_graph**: Direct database reads via scroll API
   - Handles large collections (2000+ vectors) efficiently

2. **File-based (memory.json - Fallback)**:
   - Local knowledge graph cache
   - Fast fallback when Qdrant unavailable
   - Maintains backward compatibility

### ✨ Enhanced Synchronization

**Direct Qdrant Mode** (claude-indexer integration):
1. Entities written directly to Qdrant
2. **read_graph** reads from Qdrant database
3. JSON file may be empty (fallback only)
4. Supports large-scale knowledge graphs

**Traditional MCP Mode**:
1. Changes written to memory.json
2. Embeddings generated using OpenAI
3. Vectors stored in Qdrant
4. Both storage systems remain consistent

### Search Process

When searching:
1. Query text is converted to embedding
2. Qdrant performs similarity search
3. Results include both entities and relations
4. Results are ranked by semantic similarity

## Example Usage

```typescript
// Enhanced read_graph with smart filtering (NEW)
const smartGraph = await client.callTool("read_graph", {
  mode: "smart",           // AI-optimized view (default)
  limit: 20               // Max entities per type
});
// Returns: structured summary, API surface, dependencies under 25k tokens

// Entity type filtering
const classes = await client.callTool("read_graph", {
  mode: "entities",
  entityTypes: ["class", "function"],
  limit: 10
});

// Create entities
await client.callTool("create_entities", {
  entities: [{
    name: "Project",
    entityType: "Task",
    observations: ["A new development project"]
  }]
});

// Search similar concepts
const results = await client.callTool("search_similar", {
  query: "development tasks",
  limit: 5
});
```

### 🎯 Smart Mode Features

The enhanced `read_graph` with `mode: "smart"` provides:

```typescript
interface SmartGraphResponse {
  summary: {
    totalEntities: number;
    totalRelations: number;
    breakdown: Record<string, number>; // Entity type counts
    keyModules: string[];              // Top-level packages/modules
    timestamp: string;
  };
  apiSurface: {
    classes: Array<{
      name: string;
      file: string;
      line: number;
      docstring?: string;
      methods: string[];
      inherits?: string[];
    }>;
    functions: Array<{
      name: string;
      file: string;
      line: number;
      signature?: string;
      docstring?: string;
    }>;
  };
  dependencies: {
    external: string[];                // External packages
    internal: Array<{from: string, to: string}>; // Key internal deps
  };
  relations: {
    inheritance: Array<{from: string, to: string}>;
    keyUsages: Array<{from: string, to: string, type: string}>;
  };
}
```

**Benefits:**
- ✅ **Token Compliant**: Always <25k tokens (vs 393k raw)
- ✅ **Prioritized Content**: Public APIs and documented code first  
- ✅ **Structured Insights**: Summary, dependencies, relationships
- ✅ **Performance**: Sub-second response times with large collections

## HTTPS and Reverse Proxy Configuration

The server supports connecting to Qdrant through HTTPS and reverse proxies. This is particularly useful when:
- Running Qdrant behind a reverse proxy like Nginx or Apache
- Using self-signed certificates
- Requiring custom SSL/TLS configurations

### Setting up with a Reverse Proxy

1. Configure your reverse proxy (example using Nginx):
```nginx
server {
    listen 443 ssl;
    server_name qdrant.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:6333;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

2. Update your environment variables:
```bash
QDRANT_URL=https://qdrant.yourdomain.com
```

### Security Considerations

The server implements robust HTTPS handling with:
- Custom SSL/TLS configuration
- Proper certificate verification options
- Connection pooling and keepalive
- Automatic retry with exponential backoff
- Configurable timeouts

### Troubleshooting HTTPS Connections

If you experience connection issues:

1. Verify your certificates:
```bash
openssl s_client -connect qdrant.yourdomain.com:443
```

2. Test direct connectivity:
```bash
curl -v https://qdrant.yourdomain.com/collections
```

3. Check for any proxy settings:
```bash
env | grep -i proxy
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT