/**
 * StreamingResponseBuilder for progressive content building with token enforcement
 * Builds responses section by section while monitoring token usage in real-time
 */

import { Entity, Relation, SmartGraph, KnowledgeGraph, StreamingGraphResponse, TokenBudget, ContentSection, ScrollOptions } from './types.js';
import { tokenCounter } from './tokenCounter.js';

export class StreamingResponseBuilder {
  private readonly DEFAULT_TOKEN_LIMIT = 25500; // Optimized for max utilization under 25k
  
  /**
   * Build streaming response with progressive content and token enforcement
   */
  async buildStreamingResponse(
    entities: Entity[], 
    relations: Relation[], 
    options: ScrollOptions = {}
  ): Promise<StreamingGraphResponse> {
    const mode = options.mode || 'smart';
    const limit = options.limit || 50;
    const tokenLimit = this.DEFAULT_TOKEN_LIMIT;
    
    let budget = tokenCounter.createBudget(tokenLimit);
    const sectionsIncluded: string[] = [];
    let truncated = false;
    let truncationReason: string | undefined;

    try {
      switch (mode) {
        case 'smart':
          return await this.buildSmartStreamingResponse(entities, relations, limit, budget, sectionsIncluded);
        case 'entities':
          return await this.buildEntitiesStreamingResponse(entities, options, budget, sectionsIncluded);
        case 'relationships':
          return await this.buildRelationshipsStreamingResponse(relations, budget, sectionsIncluded);
        case 'raw':
          return await this.buildRawStreamingResponse(entities, relations, budget, sectionsIncluded);
        default:
          throw new Error(`Unknown mode: ${mode}`);
      }
    } catch (error) {
      // If any error occurs, return basic response
      return {
        content: { entities: [], relations: [] },
        meta: {
          tokenCount: 0,
          tokenLimit,
          truncated: true,
          truncationReason: `Error building response: ${error}`,
          sectionsIncluded: []
        }
      };
    }
  }

  /**
   * Build smart mode response with progressive section building
   */
  private async buildSmartStreamingResponse(
    entities: Entity[], 
    relations: Relation[], 
    limitPerType: number,
    budget: TokenBudget,
    sectionsIncluded: string[]
  ): Promise<StreamingGraphResponse> {
    const smartGraph: Partial<SmartGraph> = {};
    let truncated = false;
    let truncationReason: string | undefined;

    // Section 1: Summary (highest priority, always include)
    const summarySection = this.buildSummarySection(entities, relations);
    if (tokenCounter.fitsInBudget(budget, summarySection)) {
      smartGraph.summary = summarySection;
      budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(summarySection));
      sectionsIncluded.push('summary');
    } else {
      // Summary is critical - truncate if needed
      const truncatedSummary = tokenCounter.truncateToFit(summarySection, budget);
      smartGraph.summary = truncatedSummary.content;
      budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(truncatedSummary.content));
      sectionsIncluded.push('summary (truncated)');
      truncated = true;
    }

    // Section 2: File Structure (medium priority)
    if (budget.remaining > 1000) { // Reserve tokens for other sections
      const structureSection = this.buildFileStructureSection(entities);
      if (tokenCounter.fitsInBudget(budget, structureSection)) {
        smartGraph.structure = structureSection;
        budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(structureSection));
        sectionsIncluded.push('structure');
      } else {
        const truncatedStructure = tokenCounter.truncateToFit(structureSection, budget);
        if (truncatedStructure.content) {
          smartGraph.structure = truncatedStructure.content;
          budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(truncatedStructure.content));
          sectionsIncluded.push('structure (truncated)');
          truncated = true;
        }
      }
    }

    // Section 3: API Surface (high priority)
    if (budget.remaining > 500) {
      const apiSurfaceSection = this.buildApiSurfaceSection(entities, relations, limitPerType);
      if (tokenCounter.fitsInBudget(budget, apiSurfaceSection)) {
        smartGraph.apiSurface = apiSurfaceSection;
        budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(apiSurfaceSection));
        sectionsIncluded.push('apiSurface');
      } else {
        const truncatedApiSurface = tokenCounter.truncateToFit(apiSurfaceSection, budget);
        if (truncatedApiSurface.content) {
          smartGraph.apiSurface = truncatedApiSurface.content;
          budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(truncatedApiSurface.content));
          sectionsIncluded.push('apiSurface (truncated)');
          truncated = true;
        }
      }
    }

    // Section 4: Dependencies (medium priority)
    if (budget.remaining > 300) {
      const dependenciesSection = this.buildDependenciesSection(entities, relations);
      if (tokenCounter.fitsInBudget(budget, dependenciesSection)) {
        smartGraph.dependencies = dependenciesSection;
        budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(dependenciesSection));
        sectionsIncluded.push('dependencies');
      } else {
        const truncatedDeps = tokenCounter.truncateToFit(dependenciesSection, budget);
        if (truncatedDeps.content) {
          smartGraph.dependencies = truncatedDeps.content;
          budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(truncatedDeps.content));
          sectionsIncluded.push('dependencies (truncated)');
          truncated = true;
        }
      }
    }

    // Section 5: Relations (lowest priority)
    if (budget.remaining > 200) {
      const relationsSection = this.buildRelationsSection(relations);
      if (tokenCounter.fitsInBudget(budget, relationsSection)) {
        smartGraph.relations = relationsSection;
        budget = tokenCounter.consumeTokens(budget, tokenCounter.estimateTokensWithFormatting(relationsSection));
        sectionsIncluded.push('relations');
      } else {
        truncated = true;
        truncationReason = 'Relations section excluded due to token limit';
      }
    } else {
      truncated = true;
      truncationReason = 'Relations section excluded due to token limit';
    }

    return {
      content: smartGraph as SmartGraph,
      meta: {
        tokenCount: budget.used,
        tokenLimit: budget.total,
        truncated,
        truncationReason,
        sectionsIncluded
      }
    };
  }

  /**
   * Build entities-only streaming response
   */
  private async buildEntitiesStreamingResponse(
    entities: Entity[],
    options: ScrollOptions,
    budget: TokenBudget,
    sectionsIncluded: string[]
  ): Promise<StreamingGraphResponse> {
    let filteredEntities = entities;
    
    // Filter by entity types if specified
    if (options.entityTypes && options.entityTypes.length > 0) {
      filteredEntities = entities.filter(e => options.entityTypes!.includes(e.entityType));
    }

    // Apply limit
    if (options.limit) {
      filteredEntities = filteredEntities.slice(0, options.limit);
    }

    // Check if all entities fit in budget
    const entitiesResponse = { entities: filteredEntities, relations: [] };
    if (tokenCounter.fitsInBudget(budget, entitiesResponse)) {
      return {
        content: entitiesResponse,
        meta: {
          tokenCount: tokenCounter.estimateTokensWithFormatting(entitiesResponse),
          tokenLimit: budget.total,
          truncated: false,
          sectionsIncluded: ['entities']
        }
      };
    }

    // Progressively reduce entities until they fit
    let truncatedEntities = filteredEntities;
    let truncated = false;
    
    while (truncatedEntities.length > 0) {
      const testResponse = { entities: truncatedEntities, relations: [] };
      if (tokenCounter.fitsInBudget(budget, testResponse)) {
        break;
      }
      truncatedEntities = truncatedEntities.slice(0, Math.floor(truncatedEntities.length * 0.8));
      truncated = true;
    }

    const finalResponse = { entities: truncatedEntities, relations: [] };
    return {
      content: finalResponse,
      meta: {
        tokenCount: tokenCounter.estimateTokensWithFormatting(finalResponse),
        tokenLimit: budget.total,
        truncated,
        truncationReason: truncated ? `Reduced from ${filteredEntities.length} to ${truncatedEntities.length} entities` : undefined,
        sectionsIncluded: ['entities']
      }
    };
  }

  /**
   * Build relationships-only streaming response
   */
  private async buildRelationshipsStreamingResponse(
    relations: Relation[],
    budget: TokenBudget,
    sectionsIncluded: string[]
  ): Promise<StreamingGraphResponse> {
    const relationsResponse = { entities: [], relations };
    
    if (tokenCounter.fitsInBudget(budget, relationsResponse)) {
      return {
        content: relationsResponse,
        meta: {
          tokenCount: tokenCounter.estimateTokensWithFormatting(relationsResponse),
          tokenLimit: budget.total,
          truncated: false,
          sectionsIncluded: ['relations']
        }
      };
    }

    // Progressively reduce relations
    let truncatedRelations = relations;
    let truncated = false;
    
    while (truncatedRelations.length > 0) {
      const testResponse = { entities: [], relations: truncatedRelations };
      if (tokenCounter.fitsInBudget(budget, testResponse)) {
        break;
      }
      truncatedRelations = truncatedRelations.slice(0, Math.floor(truncatedRelations.length * 0.8));
      truncated = true;
    }

    const finalResponse = { entities: [], relations: truncatedRelations };
    return {
      content: finalResponse,
      meta: {
        tokenCount: tokenCounter.estimateTokensWithFormatting(finalResponse),
        tokenLimit: budget.total,
        truncated,
        truncationReason: truncated ? `Reduced from ${relations.length} to ${truncatedRelations.length} relations` : undefined,
        sectionsIncluded: ['relations']
      }
    };
  }

  /**
   * Build raw streaming response with truncation if needed
   */
  private async buildRawStreamingResponse(
    entities: Entity[],
    relations: Relation[],
    budget: TokenBudget,
    sectionsIncluded: string[]
  ): Promise<StreamingGraphResponse> {
    const rawResponse = { entities, relations };
    
    if (tokenCounter.fitsInBudget(budget, rawResponse)) {
      return {
        content: rawResponse,
        meta: {
          tokenCount: tokenCounter.estimateTokensWithFormatting(rawResponse),
          tokenLimit: budget.total,
          truncated: false,
          sectionsIncluded: ['entities', 'relations']
        }
      };
    }

    // Raw mode exceeded limit - return error response
    return {
      content: { entities: [], relations: [] },
      meta: {
        tokenCount: 0,
        tokenLimit: budget.total,
        truncated: true,
        truncationReason: 'Raw response too large - use smart, entities, or relationships mode with limits',
        sectionsIncluded: []
      }
    };
  }

  // Helper methods for building sections (reuse existing logic patterns)
  
  private buildSummarySection(entities: Entity[], relations: Relation[]) {
    const breakdown: Record<string, number> = {};
    entities.forEach(e => {
      breakdown[e.entityType] = (breakdown[e.entityType] || 0) + 1;
    });

    const keyModules = this.extractKeyModules(entities);

    return {
      totalEntities: entities.length,
      totalRelations: relations.length,
      breakdown,
      keyModules,
      timestamp: new Date().toISOString()
    };
  }

  private buildFileStructureSection(entities: Entity[]) {
    const structure: Record<string, any> = {};
    // Simplified structure building - can be enhanced later
    entities.forEach(entity => {
      const observations = entity.observations || [];
      const fileObs = observations.find(o => o.includes('Defined in:'));
      if (fileObs) {
        const filePath = fileObs.replace('Defined in:', '').trim();
        if (!structure[filePath]) {
          structure[filePath] = { type: 'file', entities: 0 };
        }
        structure[filePath].entities++;
      }
    });
    return structure;
  }

  private buildApiSurfaceSection(entities: Entity[], relations: Relation[], limit: number) {
    const classes = entities
      .filter(e => e.entityType === 'class' && !e.name.startsWith('_'))
      .slice(0, limit)
      .map(cls => {
        const fileObs = cls.observations.find(o => o.includes('Defined in:'));
        const lineObs = cls.observations.find(o => o.includes('Line:'));
        const docObs = cls.observations.find(o => o.includes('docstring') || o.includes('Description'));
        
        return {
          name: cls.name,
          file: fileObs ? fileObs.replace('Defined in:', '').trim() : '',
          line: lineObs ? parseInt(lineObs.replace('Line:', '').trim()) : 0,
          docstring: docObs ? docObs.replace(/.*docstring[:\s]*/, '').trim().substring(0, 200) : undefined, // Truncate docstrings
          methods: [], // Simplified for now
          inherits: []
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
          signature: sigObs ? sigObs.trim().substring(0, 100) : undefined, // Truncate signatures
          docstring: docObs ? docObs.replace(/.*docstring[:\s]*/, '').trim().substring(0, 200) : undefined // Truncate docstrings
        };
      });

    return { classes, functions };
  }

  private buildDependenciesSection(entities: Entity[], relations: Relation[]) {
    const importRelations = relations.filter(r => r.relationType === 'imports');
    
    const external = new Set<string>();
    importRelations.forEach(rel => {
      if (!rel.to.includes('/') && !rel.to.includes('.py')) {
        external.add(rel.to);
      }
    });

    const internal = importRelations
      .filter(rel => rel.to.includes('/') || rel.to.includes('.py'))
      .map(rel => ({ from: rel.from, to: rel.to }))
      .slice(0, 20);

    return {
      external: Array.from(external).slice(0, 20),
      internal
    };
  }

  private buildRelationsSection(relations: Relation[]) {
    const inheritance = relations
      .filter(r => r.relationType === 'inherits')
      .map(r => ({ from: r.from, to: r.to }));

    const keyUsages = relations
      .filter(r => ['calls', 'uses', 'implements'].includes(r.relationType))
      .slice(0, 30)
      .map(r => ({ from: r.from, to: r.to, type: r.relationType }));

    return { inheritance, keyUsages };
  }

  private extractKeyModules(entities: Entity[]): string[] {
    const modules = new Set<string>();
    entities.forEach(entity => {
      const observations = entity.observations || [];
      const fileObs = observations.find(o => o.includes('Defined in:'));
      if (fileObs) {
        const filePath = fileObs.replace('Defined in:', '').trim();
        const parts = filePath.split('/');
        if (parts.length > 1) {
          modules.add(parts[0]);
        }
      }
    });
    return Array.from(modules).slice(0, 10);
  }
}

// Export singleton instance
export const streamingResponseBuilder = new StreamingResponseBuilder();