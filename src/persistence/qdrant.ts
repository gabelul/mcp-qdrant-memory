import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import crypto from "crypto";
import {
  QDRANT_URL,
  COLLECTION_NAME,
  OPENAI_API_KEY,
  QDRANT_API_KEY
} from "../config.js";
import { Entity, Relation, SmartGraph, ScrollOptions, KnowledgeGraph } from "../types.js";

// Create custom Qdrant client that adds auth header
class CustomQdrantClient extends QdrantClient {
  constructor(url: string) {
    const parsed = new URL(url);
    super({
      url: `${parsed.protocol}//${parsed.hostname}`,
      port: parsed.port ? parseInt(parsed.port) : 6333,
      https: parsed.protocol === 'https:',
      apiKey: QDRANT_API_KEY,
      timeout: 60000,
      checkCompatibility: false
    });
  }

  // Override request method to log requests
  async getCollections() {
    const result = await super.getCollections();   
    return result;
  }
}

interface EntityPayload extends Entity {
  type: "entity";
}

interface QdrantCollectionConfig {
  params: {
    vectors: {
      size: number;
      distance: string;
    };
  };
}

interface QdrantCollectionInfo {
  config: QdrantCollectionConfig;
}

interface RelationPayload extends Relation {
  type: "relation";
}

type Payload = EntityPayload | RelationPayload;

function isEntity(payload: Payload): payload is EntityPayload {
  return (
    payload.type === "entity" &&
    typeof payload.name === "string" &&
    typeof payload.entityType === "string" &&
    Array.isArray(payload.observations) &&
    payload.observations.every((obs: unknown) => typeof obs === "string")
  );
}

function isRelation(payload: Payload): payload is RelationPayload {
  return (
    payload.type === "relation" &&
    typeof payload.from === "string" &&
    typeof payload.to === "string" &&
    typeof payload.relationType === "string"
  );
}

export class QdrantPersistence {
  private client: CustomQdrantClient;
  private openai: OpenAI;
  private initialized: boolean = false;

  constructor() {
    if (!QDRANT_URL) {
      throw new Error("QDRANT_URL environment variable is required");
    }

    // Validate QDRANT_URL format and protocol
    if (
      !QDRANT_URL.startsWith("http://") &&
      !QDRANT_URL.startsWith("https://")
    ) {
      throw new Error("QDRANT_URL must start with http:// or https://");
    }

    this.client = new CustomQdrantClient(QDRANT_URL);

    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }

  async connect() {
    if (this.initialized) return;

    // Add retry logic for initial connection with exponential backoff
    let retries = 3;
    let delay = 2000; // Start with 2 second delay

    while (retries > 0) {
      try {
        await this.client.getCollections();
        this.initialized = true;
        break;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown Qdrant error";
        console.error(`Connection attempt failed: ${message}`);
        console.error("Full error:", error);

        retries--;
        if (retries === 0) {
          throw new Error(
            `Failed to connect to Qdrant after multiple attempts: ${message}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  async initialize() {
    await this.connect();

    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const requiredVectorSize = 1536; // OpenAI embedding dimension

    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collection = collections.collections.find(
        (c) => c.name === COLLECTION_NAME
      );

      if (!collection) {
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            size: requiredVectorSize,
            distance: "Cosine",
          },
        });
        return;
      }

      // Get collection info to check vector size
      const collectionInfo = (await this.client.getCollection(
        COLLECTION_NAME
      )) as QdrantCollectionInfo;
      const currentVectorSize = collectionInfo.config?.params?.vectors?.size;

      if (!currentVectorSize) {
        await this.recreateCollection(requiredVectorSize);
        return;
      }

      if (currentVectorSize !== requiredVectorSize) {
        await this.recreateCollection(requiredVectorSize);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Qdrant error";
      console.error("Failed to initialize collection:", message);
      throw new Error(
        `Failed to initialize Qdrant collection. Please check server logs for details: ${message}`
      );
    }
  }

  private async recreateCollection(vectorSize: number) {
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required in recreateCollection");
    }

    try {
      await this.client.deleteCollection(COLLECTION_NAME);
      await this.client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Qdrant error";
      throw new Error(`Failed to recreate collection: ${message}`);
    }
  }

  private async generateEmbedding(text: string) {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown OpenAI error";
      console.error("OpenAI embedding error:", message);
      throw new Error(`Failed to generate embeddings with OpenAI: ${message}`);
    }
  }

  private async hashString(str: string) {
    const hash = crypto.createHash("sha256");
    hash.update(str);
    const buffer = hash.digest();
    return buffer.readUInt32BE(0);
  }

  async persistEntity(entity: Entity) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const text = `${entity.name} (${
      entity.entityType
    }): ${entity.observations.join(". ")}`;
    const vector = await this.generateEmbedding(text);
    const id = await this.hashString(entity.name);

    const payload = {
      type: "entity",
      ...entity,
    };

    await this.client.upsert(COLLECTION_NAME, {
      points: [
        {
          id,
          vector,
          payload: payload as Record<string, unknown>,
        },
      ],
    });
  }

  async persistRelation(relation: Relation) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const text = `${relation.from} ${relation.relationType} ${relation.to}`;
    const vector = await this.generateEmbedding(text);
    const id = await this.hashString(
      `${relation.from}-${relation.relationType}-${relation.to}`
    );

    const payload = {
      type: "relation",
      ...relation,
    };

    await this.client.upsert(COLLECTION_NAME, {
      points: [
        {
          id,
          vector,
          payload: payload as Record<string, unknown>,
        },
      ],
    });
  }

  async searchSimilar(query: string, limit: number = 10) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const queryVector = await this.generateEmbedding(query);

    const results = await this.client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit,
      with_payload: true,
    });

    const validResults: Array<Entity | Relation> = [];

    for (const result of results) {
      if (!result.payload) continue;

      const payload = result.payload as unknown as Payload;

      if (isEntity(payload)) {
        const { type, ...entity } = payload;
        validResults.push(entity);
      } else if (isRelation(payload)) {
        const { type, ...relation } = payload;
        validResults.push(relation);
      }
    }

    return validResults;
  }

  async deleteEntity(entityName: string) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const id = await this.hashString(entityName);
    await this.client.delete(COLLECTION_NAME, {
      points: [id],
    });
  }

  async deleteRelation(relation: Relation) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const id = await this.hashString(
      `${relation.from}-${relation.relationType}-${relation.to}`
    );
    await this.client.delete(COLLECTION_NAME, {
      points: [id],
    });
  }

  async scrollAll(options?: ScrollOptions): Promise<KnowledgeGraph | SmartGraph> {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const mode = options?.mode || 'smart';
    const entityTypeFilter = options?.entityTypes;
    const limitPerType = options?.limit || 50;

    // First, get raw data from Qdrant
    const rawData = await this._getRawData();

    // Apply filtering
    let filteredEntities = rawData.entities;
    let filteredRelations = rawData.relations;

    if (entityTypeFilter && entityTypeFilter.length > 0) {
      filteredEntities = filteredEntities.filter(e => entityTypeFilter.includes(e.entityType));
    }

    // All modes now return raw data for streaming processing
    // The streaming response builder handles mode-specific formatting with token limits
    return { entities: filteredEntities, relations: filteredRelations };
  }

  private async _getRawData(): Promise<{ entities: Entity[], relations: Relation[] }> {
    const entities: Entity[] = [];
    const relations: Relation[] = [];
    let offset: string | number | undefined = undefined;
    const batchSize = 100;

    do {
      const scrollResult = await this.client.scroll(COLLECTION_NAME!, {
        limit: batchSize,
        offset,
        with_payload: true,
        with_vector: false,
      });

      for (const point of scrollResult.points) {
        if (!point.payload) continue;
        const payload = point.payload as unknown as Payload;

        if (isEntity(payload)) {
          const { type, ...entity } = payload;
          entities.push(entity);
        } else if (isRelation(payload)) {
          const { type, ...relation } = payload;
          relations.push(relation);
        }
      }

      offset = (typeof scrollResult.next_page_offset === 'string' || typeof scrollResult.next_page_offset === 'number') 
        ? scrollResult.next_page_offset 
        : undefined;
    } while (offset !== null && offset !== undefined);

    return { entities, relations };
  }

  private _buildEntitiesResponse(entities: Entity[], relations: Relation[], limitPerType: number): KnowledgeGraph {
    // Group entities by type and apply limits
    const entityByType: Record<string, Entity[]> = {};
    
    entities.forEach(entity => {
      if (!entityByType[entity.entityType]) {
        entityByType[entity.entityType] = [];
      }
      entityByType[entity.entityType].push(entity);
    });

    // Apply priority scoring and limits
    const limitedEntities: Entity[] = [];
    Object.entries(entityByType).forEach(([type, typeEntities]) => {
      const prioritized = this._prioritizeEntities(typeEntities);
      limitedEntities.push(...prioritized.slice(0, limitPerType));
    });

    return { entities: limitedEntities, relations };
  }

  private _buildRelationshipsResponse(entities: Entity[], relations: Relation[]): KnowledgeGraph {
    // Focus on key relationship types
    const keyRelationTypes = ['inherits', 'implements', 'contains', 'imports', 'calls'];
    const keyRelations = relations.filter(r => keyRelationTypes.includes(r.relationType));
    
    // Include entities that participate in key relationships
    const participatingEntityNames = new Set<string>();
    keyRelations.forEach(r => {
      participatingEntityNames.add(r.from);
      participatingEntityNames.add(r.to);
    });

    const participatingEntities = entities.filter(e => participatingEntityNames.has(e.name));

    return { entities: participatingEntities, relations: keyRelations };
  }

  private _buildSmartResponse(entities: Entity[], relations: Relation[], limitPerType: number): SmartGraph {
    // Build comprehensive smart response
    const breakdown: Record<string, number> = {};
    entities.forEach(e => {
      breakdown[e.entityType] = (breakdown[e.entityType] || 0) + 1;
    });

    // Get key modules from file paths
    const keyModules = this._extractKeyModules(entities);

    // Build file structure
    const structure = this._buildFileStructure(entities);

    // Extract API surface (prioritized public functions and classes)
    const apiSurface = this._extractApiSurface(entities, relations, limitPerType);

    // Analyze dependencies
    const dependencies = this._analyzeDependencies(entities, relations);

    // Extract key relationships
    const keyRelations = this._extractKeyRelations(relations);

    return {
      summary: {
        totalEntities: entities.length,
        totalRelations: relations.length,
        breakdown,
        keyModules,
        timestamp: new Date().toISOString()
      },
      structure,
      apiSurface,
      dependencies,
      relations: keyRelations
    };
  }

  private _prioritizeEntities(entities: Entity[]): Entity[] {
    return entities.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Public API bonus (not starting with underscore)
      if (!a.name.startsWith('_')) scoreA += 5;
      if (!b.name.startsWith('_')) scoreB += 5;

      // Has documentation bonus
      const aHasDoc = a.observations.some(obs => obs.includes('docstring') || obs.includes('Description'));
      const bHasDoc = b.observations.some(obs => obs.includes('docstring') || obs.includes('Description'));
      if (aHasDoc) scoreA += 10;
      if (bHasDoc) scoreB += 10;

      // Special method bonus (__init__, __new__)
      if (['__init__', '__new__'].includes(a.name)) scoreA += 8;
      if (['__init__', '__new__'].includes(b.name)) scoreB += 8;

      return scoreB - scoreA;
    });
  }

  private _extractKeyModules(entities: Entity[]): string[] {
    const modules = new Set<string>();
    entities.forEach(entity => {
      const obs = entity.observations.find(o => o.includes('Defined in:') || o.includes('file_path'));
      if (obs) {
        const pathMatch = obs.match(/[\/\\]([^\/\\]+)[\/\\][^\/\\]+\.py/);
        if (pathMatch) {
          modules.add(pathMatch[1]);
        }
      }
    });
    return Array.from(modules).slice(0, 10); // Top 10 modules
  }

  private _buildFileStructure(entities: Entity[]): Record<string, any> {
    const structure: Record<string, any> = {};
    
    entities.forEach(entity => {
      if (entity.entityType === 'file' || entity.entityType === 'directory') {
        const pathObs = entity.observations.find(o => o.includes('file_path') || o.includes('Defined in:'));
        if (pathObs) {
          const path = entity.name;
          const entityCount = entities.filter(e => 
            e.observations.some(obs => obs.includes(path))
          ).length;

          structure[path] = {
            type: entity.entityType as 'file' | 'directory',
            entities: entityCount
          };
        }
      }
    });

    return structure;
  }

  private _extractApiSurface(entities: Entity[], relations: Relation[], limit: number) {
    const classes = entities
      .filter(e => e.entityType === 'class' && !e.name.startsWith('_'))
      .slice(0, limit)
      .map(cls => {
        const fileObs = cls.observations.find(o => o.includes('Defined in:'));
        const lineObs = cls.observations.find(o => o.includes('Line:'));
        const docObs = cls.observations.find(o => o.includes('docstring') || o.includes('Description'));
        
        // Find methods of this class
        const methods = entities
          .filter(e => e.entityType === 'method' || e.entityType === 'function')
          .filter(e => e.observations.some(obs => obs.includes(cls.name)))
          .map(m => m.name)
          .slice(0, 10); // Limit methods shown

        // Find inheritance
        const inherits = relations
          .filter(r => r.relationType === 'inherits' && r.from === cls.name)
          .map(r => r.to);

        return {
          name: cls.name,
          file: fileObs ? fileObs.replace('Defined in:', '').trim() : '',
          line: lineObs ? parseInt(lineObs.replace('Line:', '').trim()) : 0,
          docstring: docObs ? docObs.replace(/.*docstring[:\s]*/, '').trim() : undefined,
          methods,
          inherits: inherits.length > 0 ? inherits : undefined
        };
      });

    const functions = entities
      .filter(e => (e.entityType === 'function' || e.entityType === 'method') && !e.name.startsWith('_'))
      .slice(0, limit)
      .map(fn => {
        const fileObs = fn.observations.find(o => o.includes('Defined in:'));
        const lineObs = fn.observations.find(o => o.includes('Line:'));
        const sigObs = fn.observations.find(o => o.includes('Signature:') || o.includes('('));
        const docObs = fn.observations.find(o => o.includes('docstring') || o.includes('Description'));

        return {
          name: fn.name,
          file: fileObs ? fileObs.replace('Defined in:', '').trim() : '',
          line: lineObs ? parseInt(lineObs.replace('Line:', '').trim()) : 0,
          signature: sigObs ? sigObs.trim() : undefined,
          docstring: docObs ? docObs.replace(/.*docstring[:\s]*/, '').trim() : undefined
        };
      });

    return { classes, functions };
  }

  private _analyzeDependencies(entities: Entity[], relations: Relation[]) {
    const importRelations = relations.filter(r => r.relationType === 'imports');
    
    // External dependencies (likely packages)
    const external = new Set<string>();
    importRelations.forEach(rel => {
      if (!rel.to.includes('/') && !rel.to.includes('.py')) {
        external.add(rel.to);
      }
    });

    // Internal dependencies
    const internal = importRelations
      .filter(rel => rel.to.includes('/') || rel.to.includes('.py'))
      .map(rel => ({ from: rel.from, to: rel.to }))
      .slice(0, 20); // Limit to key internal deps

    return {
      external: Array.from(external).slice(0, 20),
      internal
    };
  }

  private _extractKeyRelations(relations: Relation[]) {
    const inheritance = relations
      .filter(r => r.relationType === 'inherits')
      .map(r => ({ from: r.from, to: r.to }));

    const keyUsages = relations
      .filter(r => ['calls', 'uses', 'implements'].includes(r.relationType))
      .slice(0, 30) // Limit for token management
      .map(r => ({ from: r.from, to: r.to, type: r.relationType }));

    return { inheritance, keyUsages };
  }
}
