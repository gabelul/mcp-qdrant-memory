export interface Entity extends Record<string, unknown> {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation extends Record<string, unknown> {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export interface SearchResult {
  type: 'entity' | 'relation';
  score: number;
  data: Entity | Relation;
}

export interface SmartGraph {
  summary: {
    totalEntities: number;
    totalRelations: number;
    breakdown: Record<string, number>; // { "class": 45, "function": 198, ... }
    keyModules: string[]; // Top-level directories/packages
    timestamp: string;
  };
  structure: {
    // Hierarchical file tree with entity counts
    [path: string]: {
      type: 'file' | 'directory';
      entities: number;
      children?: Record<string, any>;
    };
  };
  apiSurface: {
    classes: Array<{
      name: string;
      file: string;
      line: number;
      docstring?: string;
      methods: string[]; // Just names
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
    external: string[]; // External package imports
    internal: Array<{ from: string; to: string }>; // Key internal dependencies
  };
  relations: {
    inheritance: Array<{ from: string; to: string }>;
    keyUsages: Array<{ from: string; to: string; type: string }>;
  };
}

export interface ScrollOptions {
  entityTypes?: string[];
  limit?: number;
  mode?: 'smart' | 'entities' | 'relationships' | 'raw';
}