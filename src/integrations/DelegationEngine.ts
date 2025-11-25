/**
 * DelegationEngine
 * Rule-based engine for automatically delegating tasks to agents
 * based on external events (Linear issues, GitHub PRs, webhooks).
 *
 * Features:
 * - Rule matching with JSON conditions
 * - Template variable interpolation
 * - Rate limiting per rule
 * - Approval workflow integration
 * - Workflow template triggering
 */

import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';
import { AgentService } from '../services/AgentService.js';
import { WorkflowService } from '../services/WorkflowService.js';

// Types
export interface DelegationRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  triggerSource: string;
  triggerEvent: string;
  triggerConditions: Record<string, any>;
  agentRole: string;
  agentTaskTemplate: string;
  agentBudget: number;
  maxAgentsPerDay: number;
  requiresApproval: boolean;
  approvalTimeoutMinutes: number;
  autoApproveConditions?: Record<string, any>;
  workflowTemplateId?: string;
}

export interface DelegationMatch {
  rule: DelegationRule;
  taskDescription: string;
  budget: number;
  requiresApproval: boolean;
  workflowTemplateId?: string;
}

export interface DelegationResult {
  agentId?: string;
  workflowId?: string;
  mappingId: string;
  delegated: boolean;
  error?: string;
}

export class DelegationEngine {
  private engineLogger = logger.child({ component: 'DelegationEngine' });
  private agentService: AgentService;
  private workflowService: WorkflowService;

  constructor() {
    this.agentService = new AgentService();
    this.workflowService = new WorkflowService();
  }

  // ===========================================================================
  // Rule Matching
  // ===========================================================================

  /**
   * Find a matching delegation rule for the given event
   */
  async findMatchingRule(
    source: string,
    event: string,
    payload: Record<string, any>
  ): Promise<DelegationMatch | null> {
    this.engineLogger.debug({ source, event }, 'Finding matching delegation rule');

    // Load enabled rules sorted by priority
    const result = await db.query(`
      SELECT * FROM agent_delegation_rules
      WHERE enabled = TRUE
        AND trigger_source = $1
        AND trigger_event = $2
      ORDER BY priority DESC
    `, [source, event]);

    for (const row of result.rows) {
      const rule = this.rowToRule(row);

      // Check if conditions match
      if (this.matchConditions(payload, rule.triggerConditions)) {
        // Check rate limit
        const withinLimit = await this.checkRateLimit(rule.id, rule.maxAgentsPerDay);
        if (!withinLimit) {
          this.engineLogger.warn({ ruleId: rule.id, ruleName: rule.name }, 'Rate limit exceeded');
          continue;
        }

        // Check if requires approval or can auto-approve
        const requiresApproval = rule.requiresApproval &&
          !this.matchConditions(payload, rule.autoApproveConditions || {});

        // Interpolate task template
        const taskDescription = this.interpolateTemplate(rule.agentTaskTemplate, payload);

        this.engineLogger.info(
          { ruleId: rule.id, ruleName: rule.name, requiresApproval },
          'Found matching delegation rule'
        );

        return {
          rule,
          taskDescription,
          budget: rule.agentBudget,
          requiresApproval,
          workflowTemplateId: rule.workflowTemplateId,
        };
      }
    }

    return null;
  }

  /**
   * Match conditions against payload
   * Supports: exact match, array contains, nested properties
   */
  private matchConditions(payload: Record<string, any>, conditions: Record<string, any>): boolean {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;  // Empty conditions match everything
    }

    for (const [path, expected] of Object.entries(conditions)) {
      const actual = this.getNestedProperty(payload, path);

      // Array contains check
      if (Array.isArray(expected)) {
        if (!Array.isArray(actual) || !expected.some(e => actual.includes(e))) {
          return false;
        }
      }
      // Array membership check (actual is array, expected is value)
      else if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          return false;
        }
      }
      // Exact match
      else if (actual !== expected) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get nested property from object using dot notation
   */
  private getNestedProperty(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }

  /**
   * Interpolate template variables
   * Supports: {{property}}, {{nested.property}}, {{property|default}}
   */
  private interpolateTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      // Check for default value
      const [propPath, defaultValue] = path.split('|').map((s: string) => s.trim());
      const value = this.getNestedProperty(data, propPath);

      if (value === undefined || value === null) {
        return defaultValue || match;
      }

      // Handle arrays
      if (Array.isArray(value)) {
        return value.join(', ');
      }

      return String(value);
    });
  }

  // ===========================================================================
  // Rate Limiting
  // ===========================================================================

  /**
   * Check if rule is within rate limit
   */
  private async checkRateLimit(ruleId: string, maxPerDay: number): Promise<boolean> {
    const windowStart = new Date();
    windowStart.setHours(0, 0, 0, 0);

    const result = await db.query(`
      SELECT trigger_count FROM delegation_rate_limits
      WHERE rule_id = $1 AND window_start = $2
    `, [ruleId, windowStart]);

    if (result.rows.length === 0) {
      return true;  // No limit record yet
    }

    return result.rows[0].trigger_count < maxPerDay;
  }

  /**
   * Increment rate limit counter
   */
  private async incrementRateLimit(ruleId: string): Promise<void> {
    const windowStart = new Date();
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 1);

    await db.query(`
      INSERT INTO delegation_rate_limits (rule_id, window_start, window_end, trigger_count, agent_count)
      VALUES ($1, $2, $3, 1, 1)
      ON CONFLICT (rule_id, window_start)
      DO UPDATE SET trigger_count = delegation_rate_limits.trigger_count + 1,
                    agent_count = delegation_rate_limits.agent_count + 1
    `, [ruleId, windowStart, windowEnd]);
  }

  // ===========================================================================
  // Delegation Execution
  // ===========================================================================

  /**
   * Execute delegation - spawn agent or workflow
   */
  async executeDelegate(
    delegation: DelegationMatch,
    issueId: string,
    issueIdentifier: string
  ): Promise<DelegationResult> {
    this.engineLogger.info(
      { ruleId: delegation.rule.id, ruleName: delegation.rule.name, issueId },
      'Executing delegation'
    );

    try {
      // Increment rate limit
      await this.incrementRateLimit(delegation.rule.id);

      // Update rule trigger stats
      await db.query(`
        UPDATE agent_delegation_rules
        SET last_triggered_at = NOW(), trigger_count = trigger_count + 1
        WHERE id = $1
      `, [delegation.rule.id]);

      let result: DelegationResult;

      if (delegation.workflowTemplateId) {
        // Spawn workflow
        result = await this.spawnWorkflow(delegation, issueId, issueIdentifier);
      } else {
        // Spawn single agent
        result = await this.spawnAgent(delegation, issueId, issueIdentifier);
      }

      return result;

    } catch (error) {
      this.engineLogger.error({ error, ruleId: delegation.rule.id }, 'Delegation execution failed');
      throw error;
    }
  }

  /**
   * Spawn a single agent for the delegation
   */
  private async spawnAgent(
    delegation: DelegationMatch,
    issueId: string,
    issueIdentifier: string
  ): Promise<DelegationResult> {
    // Spawn agent
    const agentId = await this.agentService.spawnAgent(
      delegation.rule.agentRole,
      delegation.taskDescription,
      delegation.budget
    );

    // Create Linear mapping
    const mappingId = await this.createMapping(
      issueId,
      issueIdentifier,
      agentId,
      null,
      delegation.rule.id
    );

    this.engineLogger.info(
      { agentId, mappingId, issueIdentifier },
      'Agent spawned and mapped to Linear issue'
    );

    return {
      agentId,
      mappingId,
      delegated: true,
    };
  }

  /**
   * Spawn a workflow for the delegation
   */
  private async spawnWorkflow(
    delegation: DelegationMatch,
    issueId: string,
    issueIdentifier: string
  ): Promise<DelegationResult> {
    // Instantiate workflow from template
    const { graph } = await this.workflowService.instantiateTemplate(
      delegation.workflowTemplateId!,
      `Linear-${issueIdentifier}`,  // name
      delegation.taskDescription,    // task
      delegation.budget              // totalBudget
    );

    // Create Linear mapping
    const mappingId = await this.createMapping(
      issueId,
      issueIdentifier,
      null,
      graph.id,
      delegation.rule.id
    );

    this.engineLogger.info(
      { workflowId: graph.id, mappingId, issueIdentifier },
      'Workflow spawned and mapped to Linear issue'
    );

    return {
      workflowId: graph.id,
      mappingId,
      delegated: true,
    };
  }

  /**
   * Create Linear-Agent mapping
   */
  private async createMapping(
    issueId: string,
    issueIdentifier: string,
    agentId: string | null,
    workflowId: string | null,
    ruleId: string
  ): Promise<string> {
    const result = await db.query(`
      INSERT INTO linear_agent_mappings (
        linear_issue_id, linear_issue_identifier, agent_id, workflow_graph_id, delegation_rule_id
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [issueId, issueIdentifier, agentId, workflowId, ruleId]);

    return result.rows[0].id;
  }

  // ===========================================================================
  // Approval Workflow
  // ===========================================================================

  /**
   * Create approval request for delegation
   */
  async createApprovalRequest(
    requestType: string,
    entityId: string,
    data: Record<string, any>
  ): Promise<string> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (data.approval_timeout || 60));

    const result = await db.query(`
      INSERT INTO approval_requests (
        request_type, entity_type, entity_id, requested_by, request_data,
        risk_level, estimated_cost, expires_at
      ) VALUES ($1, 'linear_issue', $2, 'linear_webhook', $3, $4, $5, $6)
      RETURNING id
    `, [
      requestType,
      entityId,
      JSON.stringify(data),
      data.delegation_rule?.riskLevel || 'medium',
      data.budget || null,
      expiresAt,
    ]);

    this.engineLogger.info(
      { approvalId: result.rows[0].id, requestType, entityId },
      'Approval request created'
    );

    return result.rows[0].id;
  }

  /**
   * Process approved delegation request
   */
  async processApproval(approvalId: string): Promise<DelegationResult | null> {
    // Get approval request
    const approval = await db.query(
      `SELECT * FROM approval_requests WHERE id = $1 AND status = 'approved'`,
      [approvalId]
    );

    if (approval.rows.length === 0) {
      this.engineLogger.warn({ approvalId }, 'Approval not found or not approved');
      return null;
    }

    const request = approval.rows[0];
    const data = typeof request.request_data === 'string'
      ? JSON.parse(request.request_data)
      : request.request_data;

    // Execute delegation
    const delegation: DelegationMatch = {
      rule: data.delegation_rule,
      taskDescription: data.task_description,
      budget: data.budget,
      requiresApproval: false,  // Already approved
      workflowTemplateId: data.delegation_rule?.workflowTemplateId,
    };

    const result = await this.executeDelegate(
      delegation,
      data.linear_issue.id,
      data.linear_issue.identifier
    );

    // Update approval with result
    await db.query(`
      UPDATE approval_requests
      SET request_data = request_data || $2
      WHERE id = $1
    `, [approvalId, JSON.stringify({ delegation_result: result })]);

    return result;
  }

  // ===========================================================================
  // Rule Management
  // ===========================================================================

  /**
   * Create a new delegation rule
   */
  async createRule(rule: Omit<DelegationRule, 'id'>): Promise<string> {
    const result = await db.query(`
      INSERT INTO agent_delegation_rules (
        name, description, priority, enabled,
        trigger_source, trigger_event, trigger_conditions,
        agent_role, agent_task_template, agent_budget, max_agents_per_day,
        requires_approval, approval_timeout_minutes, auto_approve_conditions,
        workflow_template_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      rule.name,
      rule.description || null,
      String(rule.priority || 0),
      rule.enabled !== false,
      rule.triggerSource,
      rule.triggerEvent,
      JSON.stringify(rule.triggerConditions || {}),
      rule.agentRole,
      rule.agentTaskTemplate,
      rule.agentBudget || 50000,
      rule.maxAgentsPerDay || 10,
      rule.requiresApproval || false,
      rule.approvalTimeoutMinutes || 60,
      rule.autoApproveConditions ? JSON.stringify(rule.autoApproveConditions) : null,
      rule.workflowTemplateId || null,
    ]);

    this.engineLogger.info({ ruleId: result.rows[0].id, ruleName: rule.name }, 'Delegation rule created');
    return result.rows[0].id;
  }

  /**
   * Get all delegation rules
   */
  async listRules(): Promise<DelegationRule[]> {
    const result = await db.query(`
      SELECT * FROM agent_delegation_rules
      ORDER BY priority DESC, created_at DESC
    `);
    return result.rows.map(this.rowToRule);
  }

  /**
   * Get a specific rule
   */
  async getRule(id: string): Promise<DelegationRule | null> {
    const result = await db.query(
      `SELECT * FROM agent_delegation_rules WHERE id = $1`,
      [id]
    );
    return result.rows.length > 0 ? this.rowToRule(result.rows[0]) : null;
  }

  /**
   * Update a delegation rule
   */
  async updateRule(id: string, updates: Partial<DelegationRule>): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      priority: 'priority',
      enabled: 'enabled',
      triggerConditions: 'trigger_conditions',
      agentRole: 'agent_role',
      agentTaskTemplate: 'agent_task_template',
      agentBudget: 'agent_budget',
      maxAgentsPerDay: 'max_agents_per_day',
      requiresApproval: 'requires_approval',
      approvalTimeoutMinutes: 'approval_timeout_minutes',
      autoApproveConditions: 'auto_approve_conditions',
      workflowTemplateId: 'workflow_template_id',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        let value = (updates as any)[key];
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        values.push(value);
      }
    }

    if (setClauses.length === 0) return;

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    await db.query(`
      UPDATE agent_delegation_rules
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
    `, values);

    this.engineLogger.info({ ruleId: id }, 'Delegation rule updated');
  }

  /**
   * Delete a delegation rule
   */
  async deleteRule(id: string): Promise<void> {
    await db.query(`DELETE FROM agent_delegation_rules WHERE id = $1`, [id]);
    this.engineLogger.info({ ruleId: id }, 'Delegation rule deleted');
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private rowToRule(row: any): DelegationRule {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      priority: row.priority,
      enabled: row.enabled,
      triggerSource: row.trigger_source,
      triggerEvent: row.trigger_event,
      triggerConditions: typeof row.trigger_conditions === 'string'
        ? JSON.parse(row.trigger_conditions)
        : row.trigger_conditions || {},
      agentRole: row.agent_role,
      agentTaskTemplate: row.agent_task_template,
      agentBudget: row.agent_budget,
      maxAgentsPerDay: row.max_agents_per_day,
      requiresApproval: row.requires_approval,
      approvalTimeoutMinutes: row.approval_timeout_minutes,
      autoApproveConditions: row.auto_approve_conditions
        ? (typeof row.auto_approve_conditions === 'string'
            ? JSON.parse(row.auto_approve_conditions)
            : row.auto_approve_conditions)
        : undefined,
      workflowTemplateId: row.workflow_template_id,
    };
  }
}
