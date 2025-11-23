import { z } from 'zod';

/**
 * Hierarchy relationship type enum
 * - parent_child: Standard parent-child relationship
 * - sibling: Agents at the same depth level
 * - delegation: Task delegation relationship
 * - coordination: Coordination/collaboration relationship
 */
export const HierarchyRelationType = z.enum(['parent_child', 'sibling', 'delegation', 'coordination']);
export type HierarchyRelationTypeType = z.infer<typeof HierarchyRelationType>;

/**
 * Hierarchy model schema
 * Represents relationships between agents in the multi-agent system
 */
export const HierarchySchema = z.object({
  /** Unique identifier for the hierarchy relationship */
  id: z.string().uuid(),

  /** Parent agent ID in the relationship */
  parent_agent_id: z.string().uuid(),

  /** Child agent ID in the relationship */
  child_agent_id: z.string().uuid(),

  /** Type of relationship between agents */
  relation_type: HierarchyRelationType,

  /** Timestamp when the relationship was created */
  created_at: z.date(),
});

export type Hierarchy = z.infer<typeof HierarchySchema>;

/**
 * Schema for creating a new hierarchy relationship (without auto-generated fields)
 */
export const CreateHierarchySchema = HierarchySchema.omit({
  id: true,
  created_at: true,
}).extend({
  relation_type: HierarchyRelationType.default('parent_child'),
});

export type CreateHierarchy = z.infer<typeof CreateHierarchySchema>;

/**
 * Schema for hierarchy tree node (includes agent details)
 */
export const HierarchyTreeNodeSchema: z.ZodType<any> = z.object({
  /** Agent ID */
  agent_id: z.string().uuid(),

  /** Agent role */
  role: z.string(),

  /** Agent status */
  status: z.string(),

  /** Depth level in hierarchy */
  depth_level: z.number().int().min(0),

  /** Parent agent ID */
  parent_id: z.string().uuid().nullable(),

  /** Child agents */
  children: z.array(z.lazy(() => HierarchyTreeNodeSchema)),

  /** Relation type to parent */
  relation_type: HierarchyRelationType.nullable(),
});

export type HierarchyTreeNode = z.infer<typeof HierarchyTreeNodeSchema>;

/**
 * Helper to check if relationship creates a cycle
 */
export function wouldCreateCycle(
  parent_agent_id: string,
  child_agent_id: string,
  existingHierarchies: Hierarchy[]
): boolean {
  // Can't be your own parent
  if (parent_agent_id === child_agent_id) {
    return true;
  }

  // Check if child is an ancestor of parent
  const visited = new Set<string>();
  const stack = [parent_agent_id];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current === child_agent_id) {
      return true;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    // Find parents of current agent
    const parents = existingHierarchies
      .filter((h) => h.child_agent_id === current)
      .map((h) => h.parent_agent_id);

    stack.push(...parents);
  }

  return false;
}

/**
 * Helper to get all descendants of an agent
 */
export function getDescendants(
  agent_id: string,
  hierarchies: Hierarchy[]
): string[] {
  const descendants: string[] = [];
  const queue = [agent_id];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const children = hierarchies
      .filter((h) => h.parent_agent_id === current)
      .map((h) => h.child_agent_id);

    descendants.push(...children);
    queue.push(...children);
  }

  return descendants;
}

/**
 * Helper to get all ancestors of an agent
 */
export function getAncestors(
  agent_id: string,
  hierarchies: Hierarchy[]
): string[] {
  const ancestors: string[] = [];
  const queue = [agent_id];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const parents = hierarchies
      .filter((h) => h.child_agent_id === current)
      .map((h) => h.parent_agent_id);

    ancestors.push(...parents);
    queue.push(...parents);
  }

  return ancestors;
}

/**
 * Helper to get siblings of an agent
 */
export function getSiblings(
  agent_id: string,
  hierarchies: Hierarchy[]
): string[] {
  // Find parent
  const parentRelation = hierarchies.find((h) => h.child_agent_id === agent_id);

  if (!parentRelation) {
    return [];
  }

  // Find all children of the same parent
  return hierarchies
    .filter(
      (h) =>
        h.parent_agent_id === parentRelation.parent_agent_id &&
        h.child_agent_id !== agent_id
    )
    .map((h) => h.child_agent_id);
}

/**
 * Helper to get depth of an agent in the hierarchy
 */
export function getAgentDepth(
  agent_id: string,
  hierarchies: Hierarchy[]
): number {
  let depth = 0;
  let current = agent_id;

  while (true) {
    const parentRelation = hierarchies.find((h) => h.child_agent_id === current);

    if (!parentRelation) {
      break;
    }

    depth++;
    current = parentRelation.parent_agent_id;

    // Prevent infinite loops
    if (depth > 100) {
      throw new Error('Hierarchy depth exceeds maximum (possible cycle detected)');
    }
  }

  return depth;
}
