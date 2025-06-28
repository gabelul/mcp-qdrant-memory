#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
// import { promises as fs } from 'fs'; // Removed: No longer using file system for JSON storage
// import path from 'path'; // Removed: No longer needed for file paths
// import { fileURLToPath } from 'url'; // Removed: No longer needed for file paths
import { QdrantPersistence } from './persistence/qdrant.js';
import { Entity, Relation, KnowledgeGraph, SmartGraph, ScrollOptions, StreamingGraphResponse, SearchResult } from './types.js';
import { streamingResponseBuilder } from './streamingResponseBuilder.js';
import { COLLECTION_NAME } from './config.js';
import {
  validateCreateEntitiesRequest,
  validateCreateRelationsRequest,
  validateAddObservationsRequest,
  validateDeleteEntitiesRequest,
  validateDeleteObservationsRequest,
  validateDeleteRelationsRequest,
  validateSearchSimilarRequest,
  validateGetImplementationRequest,
} from './validation.js';

// Removed: Path definitions no longer needed since we're not writing JSON files

class KnowledgeGraphManager {
  private qdrant: QdrantPersistence;

  constructor() {
    this.qdrant = new QdrantPersistence();
  }

  async initialize(): Promise<void> {
    // Initialize Qdrant - it's the sole source of truth
    await this.qdrant.initialize();
  }

  // async save(): Promise<void> {
  //   await fs.writeFile(MEMORY_FILE_PATH, JSON.stringify(this.graph, null, 2));
  // } // Removed: JSON file writing disabled

  async addEntities(entities: Entity[]): Promise<void> {
    for (const entity of entities) {
      // Since we're using Qdrant as the sole source of truth, just persist
      await this.qdrant.persistEntity(entity);
    }
    // await this.save(); // Removed: JSON file writing disabled
  }

  async addRelations(relations: Relation[]): Promise<void> {
    // Load current entities from Qdrant for validation
    const currentGraph = await this.getRawGraph();
    
    for (const relation of relations) {
      if (!currentGraph.entities.some(e => e.name === relation.from)) {
        throw new Error(`Entity not found: ${relation.from}`);
      }
      if (!currentGraph.entities.some(e => e.name === relation.to)) {
        throw new Error(`Entity not found: ${relation.to}`);
      }
      
      // Since we're using Qdrant as the sole source of truth, just persist
      await this.qdrant.persistRelation(relation);
    }
    // await this.save(); // Removed: JSON file writing disabled
  }

  async addObservations(entityName: string, observations: string[]): Promise<void> {
    // Load current entities from Qdrant
    const currentGraph = await this.getRawGraph();
    const entity = currentGraph.entities.find((e: Entity) => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    entity.observations.push(...observations);
    await this.qdrant.persistEntity(entity);
    // await this.save(); // Removed: JSON file writing disabled
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    // Load current graph to find related relations
    const currentGraph = await this.getRawGraph();
    
    for (const name of entityNames) {
      // Delete the entity
      await this.qdrant.deleteEntity(name);
      
      // Delete all relations involving this entity
      const relatedRelations = currentGraph.relations.filter(
        (r: Relation) => r.from === name || r.to === name
      );
      for (const relation of relatedRelations) {
        await this.qdrant.deleteRelation(relation);
      }
    }
    // await this.save(); // Removed: JSON file writing disabled
  }

  async deleteObservations(entityName: string, observations: string[]): Promise<void> {
    // Load current entities from Qdrant
    const currentGraph = await this.getRawGraph();
    const entity = currentGraph.entities.find((e: Entity) => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    entity.observations = entity.observations.filter((o: string) => !observations.includes(o));
    await this.qdrant.persistEntity(entity);
    // await this.save(); // Removed: JSON file writing disabled
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    for (const relation of relations) {
      // Since we're using Qdrant as the sole source of truth, just delete
      await this.qdrant.deleteRelation(relation);
    }
    // await this.save(); // Removed: JSON file writing disabled
  }

  async getGraph(options?: ScrollOptions): Promise<KnowledgeGraph | SmartGraph> {
    try {
      return await this.qdrant.scrollAll(options);
    } catch (error) {
      console.error('Failed to read from Qdrant:', error);
      // Return empty graph on error
      return { entities: [], relations: [] };
    }
  }

  async getRawGraph(): Promise<KnowledgeGraph> {
    try {
      // Get raw entities and relations from Qdrant without any processing
      const rawData = await this.qdrant.scrollAll({ mode: 'raw' });
      if ('entities' in rawData && 'relations' in rawData) {
        return rawData as KnowledgeGraph;
      }
      // If it's not a KnowledgeGraph (e.g., SmartGraph), return empty
      return { entities: [], relations: [] };
    } catch (error) {
      console.error('Failed to read raw graph from Qdrant:', error);
      return { entities: [], relations: [] };
    }
  }

  async searchSimilar(query: string, limit: number = 10, metadataOnly: boolean = true): Promise<SearchResult[]> {
    // Ensure limit is a positive number
    const validLimit = Math.max(1, Math.min(limit, 100)); // Cap at 100 results
    return await this.qdrant.searchSimilar(query, validLimit, metadataOnly);
  }

  async getImplementation(entityName: string): Promise<SearchResult[]> {
    return await this.qdrant.getImplementationChunks(entityName);
  }
}

interface CallToolRequest {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

class MemoryServer {
  private server: Server;
  private graphManager: KnowledgeGraphManager;

  constructor() {
    this.server = new Server(
      {
        name: "memory",
        version: "0.6.2",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.graphManager = new KnowledgeGraphManager();
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "create_entities",
          description: "Create multiple new entities in the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              entities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    entityType: { type: "string" },
                    observations: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["name", "entityType", "observations"]
                }
              }
            },
            required: ["entities"]
          }
        },
        {
          name: "create_relations",
          description: "Create multiple new relations between entities",
          inputSchema: {
            type: "object",
            properties: {
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    relationType: { type: "string" }
                  },
                  required: ["from", "to", "relationType"]
                }
              }
            },
            required: ["relations"]
          }
        },
        {
          name: "add_observations",
          description: "Add new observations to existing entities",
          inputSchema: {
            type: "object",
            properties: {
              observations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entityName: { type: "string" },
                    contents: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["entityName", "contents"]
                }
              }
            },
            required: ["observations"]
          }
        },
        {
          name: "delete_entities",
          description: "Delete multiple entities and their relations",
          inputSchema: {
            type: "object",
            properties: {
              entityNames: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["entityNames"]
          }
        },
        {
          name: "delete_observations",
          description: "Delete specific observations from entities",
          inputSchema: {
            type: "object",
            properties: {
              deletions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entityName: { type: "string" },
                    observations: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["entityName", "observations"]
                }
              }
            },
            required: ["deletions"]
          }
        },
        {
          name: "delete_relations",
          description: "Delete multiple relations",
          inputSchema: {
            type: "object",
            properties: {
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    relationType: { type: "string" }
                  },
                  required: ["from", "to", "relationType"]
                }
              }
            },
            required: ["relations"]
          }
        },
        {
          name: "read_graph",
          description: "Read filtered knowledge graph with smart summarization",
          inputSchema: {
            type: "object",
            properties: {
              mode: {
                type: "string",
                enum: ["smart", "entities", "relationships", "raw"],
                description: "smart: AI-optimized view (default), entities: filtered entities, relationships: connection focus, raw: full graph (may exceed limits)",
                default: "smart"
              },
              entityTypes: {
                type: "array",
                items: { type: "string" },
                description: "Filter specific entity types (e.g., ['class', 'function'])"
              },
              limit: {
                type: "number",
                description: "Max entities per type (default: 50)",
                default: 50
              }
            }
          }
        },
        {
          name: "search_similar",
          description: "Search for similar entities and relations using semantic search with progressive disclosure support",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { 
                type: "number",
                default: 10
              },
              metadataOnly: {
                type: "boolean",
                default: true,
                description: "If true, returns only metadata chunks for 90% faster performance. Set to false for full implementation search."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "get_implementation",
          description: "Retrieve detailed implementation chunks for a specific entity (progressive disclosure)",
          inputSchema: {
            type: "object",
            properties: {
              entityName: { 
                type: "string",
                description: "Name of the entity to get implementation details for"
              }
            },
            required: ["entityName"]
          }
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments"
        );
      }

      try {
        switch (request.params.name) {
          case "create_entities": {
            const args = validateCreateEntitiesRequest(request.params.arguments);
            await this.graphManager.addEntities(args.entities);
            return {
              content: [{ type: "text", text: "Entities created successfully" }],
            };
          }

          case "create_relations": {
            const args = validateCreateRelationsRequest(request.params.arguments);
            await this.graphManager.addRelations(args.relations);
            return {
              content: [{ type: "text", text: "Relations created successfully" }],
            };
          }

          case "add_observations": {
            const args = validateAddObservationsRequest(request.params.arguments);
            for (const obs of args.observations) {
              await this.graphManager.addObservations(obs.entityName, obs.contents);
            }
            return {
              content: [{ type: "text", text: "Observations added successfully" }],
            };
          }

          case "delete_entities": {
            const args = validateDeleteEntitiesRequest(request.params.arguments);
            await this.graphManager.deleteEntities(args.entityNames);
            return {
              content: [{ type: "text", text: "Entities deleted successfully" }],
            };
          }

          case "delete_observations": {
            const args = validateDeleteObservationsRequest(request.params.arguments);
            for (const del of args.deletions) {
              await this.graphManager.deleteObservations(del.entityName, del.observations);
            }
            return {
              content: [{ type: "text", text: "Observations deleted successfully" }],
            };
          }

          case "delete_relations": {
            const args = validateDeleteRelationsRequest(request.params.arguments);
            await this.graphManager.deleteRelations(args.relations);
            return {
              content: [{ type: "text", text: "Relations deleted successfully" }],
            };
          }

          case "read_graph": {
            const mode = (request.params.arguments?.mode as 'smart' | 'entities' | 'relationships' | 'raw') || 'smart';
            const entityTypes = request.params.arguments?.entityTypes as string[] | undefined;
            const limit = (request.params.arguments?.limit as number) || 50;
            
            const options: ScrollOptions = {
              mode,
              entityTypes,
              limit
            };
            
            // Get raw entities and relations from Qdrant for streaming response
            const rawGraph = await this.graphManager.getRawGraph();
            const streamingResponse = await streamingResponseBuilder.buildStreamingResponse(
              rawGraph.entities,
              rawGraph.relations,
              options
            );
            
            // Format response compactly to respect token limits (no pretty-printing)
            const responseText = JSON.stringify(streamingResponse.content);
            const metaText = `\n\n<!-- Response Metadata:\nTokens: ${streamingResponse.meta.tokenCount}/${streamingResponse.meta.tokenLimit}\nTruncated: ${streamingResponse.meta.truncated}\nSections: ${streamingResponse.meta.sectionsIncluded.join(', ')}\n${streamingResponse.meta.truncationReason ? `Reason: ${streamingResponse.meta.truncationReason}\n` : ''}-->`;
            
            return {
              content: [
                {
                  type: "text",
                  text: responseText + metaText,
                },
              ],
            };
          }

          case "search_similar": {
            const args = validateSearchSimilarRequest(request.params.arguments);
            const metadataOnly = args.metadataOnly !== undefined ? args.metadataOnly : true;
            const results = await this.graphManager.searchSimilar(
              args.query,
              args.limit,
              metadataOnly
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          }

          case "get_implementation": {
            const args = validateGetImplementationRequest(request.params.arguments);
            const results = await this.graphManager.getImplementation(args.entityName);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }

  async run() {
    try {
      await this.graphManager.initialize();
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Memory MCP server running on stdio");
    } catch (error) {
      console.error("Fatal error running server:", error);
      process.exit(1);
    }
  }
}

// Server startup
const server = new MemoryServer();
server.run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});