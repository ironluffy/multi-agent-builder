import { z } from 'zod';

/**
 * Workspace status enum
 * - active: Workspace is currently in use
 * - completed: Workspace task is completed
 * - archived: Workspace is archived for historical reference
 */
export const WorkspaceStatus = z.enum(['active', 'completed', 'archived']);
export type WorkspaceStatusType = z.infer<typeof WorkspaceStatus>;

/**
 * Workspace model schema
 * Represents an isolated environment for agent collaboration
 */
export const WorkspaceSchema = z.object({
  /** Unique identifier for the workspace */
  id: z.string().uuid(),

  /** Human-readable name for the workspace */
  name: z.string().min(1).max(255),

  /** Detailed description of the workspace purpose */
  description: z.string().nullable(),

  /** Current status of the workspace */
  status: WorkspaceStatus,

  /** Configuration settings for this workspace */
  config: z.record(z.unknown()).nullable(),

  /** Timestamp when the workspace was created */
  created_at: z.date(),

  /** Timestamp when the workspace was last updated */
  updated_at: z.date(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

/**
 * Schema for creating a new workspace (without auto-generated fields)
 */
export const CreateWorkspaceSchema = WorkspaceSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).extend({
  status: WorkspaceStatus.default('active'),
  description: z.string().nullable().optional(),
  config: z.record(z.unknown()).nullable().optional(),
});

export type CreateWorkspace = z.infer<typeof CreateWorkspaceSchema>;

/**
 * Schema for updating a workspace
 */
export const UpdateWorkspaceSchema = WorkspaceSchema.partial().omit({
  id: true,
  created_at: true,
});

export type UpdateWorkspace = z.infer<typeof UpdateWorkspaceSchema>;

/**
 * Schema for workspace configuration
 */
export const WorkspaceConfigSchema = z.object({
  /** Maximum depth level allowed for agent hierarchies */
  max_depth: z.number().int().min(0).optional(),

  /** Default token limit for agents in this workspace */
  default_token_limit: z.number().int().min(0).optional(),

  /** Allowed agent roles in this workspace */
  allowed_roles: z.array(z.string()).optional(),

  /** Auto-save checkpoint interval in minutes */
  checkpoint_interval: z.number().int().min(0).optional(),

  /** Enable/disable collaborative features */
  collaboration_enabled: z.boolean().optional(),

  /** Custom settings specific to this workspace */
  custom: z.record(z.unknown()).optional(),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

/**
 * Helper to check if workspace is active
 */
export function isWorkspaceActive(workspace: Workspace): boolean {
  return workspace.status === 'active';
}

/**
 * Helper to get workspace config with defaults
 */
export function getWorkspaceConfig(workspace: Workspace): WorkspaceConfig {
  const defaultConfig: WorkspaceConfig = {
    max_depth: 5,
    default_token_limit: 100000,
    allowed_roles: ['researcher', 'coder', 'reviewer', 'tester', 'planner'],
    checkpoint_interval: 30,
    collaboration_enabled: true,
  };

  if (!workspace.config) {
    return defaultConfig;
  }

  return {
    ...defaultConfig,
    ...workspace.config,
  } as WorkspaceConfig;
}
