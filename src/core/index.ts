/**
 * Core Module - Agent Orchestration System
 *
 * This module provides the core agent implementation with a three-layer architecture:
 *
 * 1. Agent (Presentation Layer) - src/core/Agent.ts
 *    - Public API for agent operations
 *    - State machine for lifecycle management
 *    - Coordinates between business logic and data access
 *
 * 2. AgentCore (Business Logic Layer) - src/core/AgentCore.ts
 *    - Anthropic API integration
 *    - Token counting and budget tracking
 *    - Execution logic and error handling
 *
 * 3. AgentRepository (Data Access Layer) - src/database/repositories/AgentRepository.ts
 *    - CRUD operations for agents table
 *    - Query methods for agent relationships
 *    - Type-safe database interactions
 *
 * @module core
 */

export { Agent } from './Agent.js';
export { AgentCore, TokenCounter, BudgetTracker } from './AgentCore.js';

// Re-export repository for convenience
export { AgentRepository, agentRepository } from '../database/repositories/AgentRepository.js';

// Re-export types
export type {
  Agent as AgentModel,
  CreateAgent,
  UpdateAgent,
  AgentStatusType,
} from '../models/Agent.js';
