/**
 * Multi-Agent Builder - Library Exports
 *
 * Exports core system components and services for programmatic use.
 */

// Core Agent System
export { Agent } from './core/Agent.js';
export { WorkflowEngine } from './core/WorkflowEngine.js';

// Services
export { AgentService } from './services/AgentService.js';
export { BudgetService } from './services/BudgetService.js';
export { HierarchyService } from './services/HierarchyService.js';
export { WorkflowService } from './services/WorkflowService.js';
export { WorkflowPoller } from './services/WorkflowPoller.js';

// Repositories
export { AgentRepository } from './database/repositories/AgentRepository.js';
export { BudgetRepository } from './database/repositories/BudgetRepository.js';
export { HierarchyRepository } from './database/repositories/HierarchyRepository.js';
export { MessageRepository } from './database/repositories/MessageRepository.js';
export { WorkspaceRepository } from './database/repositories/WorkspaceRepository.js';
export { WorkflowRepository } from './database/repositories/WorkflowRepository.js';

// Models
export type { Agent as AgentModel } from './models/Agent.js';
export type { Budget } from './models/Budget.js';
export type { Hierarchy } from './models/Hierarchy.js';
export type { Message } from './models/Message.js';
export type { Workspace } from './models/Workspace.js';
export type { WorkflowGraph } from './models/WorkflowGraph.js';
export type { WorkflowNode } from './models/WorkflowNode.js';
export type { WorkflowTemplate } from './models/WorkflowTemplate.js';

// Database
export { db } from './infrastructure/SharedDatabase.js';

// Utilities
export { logger } from './utils/Logger.js';
