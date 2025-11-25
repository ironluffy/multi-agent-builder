/**
 * MonitoringServerV2
 * Enhanced monitoring server with WebSocket support for real-time dashboard updates.
 *
 * Features:
 * - Socket.io for bidirectional WebSocket communication
 * - REST API for standard queries
 * - Server-Sent Events (SSE) as fallback
 * - Room-based subscriptions (per-agent, per-workflow)
 * - Real-time metrics aggregation
 * - Agent control commands
 */

import http from 'http';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Server as SocketServer, Socket } from 'socket.io';
import cors from 'cors';
import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';
import { AgentRepository } from '../database/repositories/AgentRepository.js';
import { WorkflowRepository } from '../database/repositories/WorkflowRepository.js';

// Types
interface DashboardMetrics {
  totalAgents: number;
  activeAgents: number;
  completedAgents: number;
  failedAgents: number;
  pausedAgents: number;
  totalTokensUsed: number;
  avgDurationMs: number;
  pendingApprovals: number;
  activeWorkflows: number;
}

// AgentUpdate type used by broadcast methods
export interface AgentUpdate {
  agentId: string;
  status: string;
  tokensUsed?: number;
  progress?: number;
}

interface TraceUpdate {
  agentId: string;
  traceIndex: number;
  messageType: string;
  content: string;
  timestamp: Date;
}

export class MonitoringServerV2 {
  private app: Express;
  private server: http.Server;
  private io: SocketServer;
  private serverLogger = logger.child({ component: 'MonitoringServerV2' });
  private agentRepo: AgentRepository;

  private metricsInterval: NodeJS.Timeout | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(private port: number = 3001) {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new SocketServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.agentRepo = new AgentRepository();
    // WorkflowRepository initialized for future workflow monitoring
    new WorkflowRepository();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  // ===========================================================================
  // Middleware Setup
  // ===========================================================================

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      this.serverLogger.debug({ method: req.method, path: req.path }, 'API request');
      next();
    });
  }

  // ===========================================================================
  // REST API Routes
  // ===========================================================================

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Dashboard landing page
    this.app.get('/', (_req: Request, res: Response) => {
      res.send(this.getDashboardHTML());
    });

    // System metrics
    this.app.get('/api/metrics', async (_req: Request, res: Response) => {
      try {
        const metrics = await this.getSystemMetrics();
        res.json(metrics);
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to get metrics');
        res.status(500).json({ error: 'Failed to get metrics' });
      }
    });

    // List all agents with monitoring data
    this.app.get('/api/agents', async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const status = req.query.status as string;

        const agents = await this.getAgentsWithMonitoring(limit, offset, status);
        res.json(agents);
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to list agents');
        res.status(500).json({ error: 'Failed to list agents' });
      }
    });

    // Get single agent with full details
    this.app.get('/api/agents/:id', async (req: Request, res: Response) => {
      try {
        const agentDetails = await this.getAgentDetails(req.params.id);
        if (!agentDetails) {
          res.status(404).json({ error: 'Agent not found' });
          return;
        }
        res.json(agentDetails);
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to get agent details');
        res.status(500).json({ error: 'Failed to get agent details' });
      }
    });

    // Agent control commands
    this.app.post('/api/agents/:id/pause', async (req: Request, res: Response) => {
      try {
        await this.pauseAgent(req.params.id, req.body.reason || 'Manual pause');
        res.json({ success: true, message: 'Agent paused' });
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to pause agent');
        res.status(500).json({ error: 'Failed to pause agent' });
      }
    });

    this.app.post('/api/agents/:id/resume', async (req: Request, res: Response) => {
      try {
        await this.resumeAgent(req.params.id);
        res.json({ success: true, message: 'Agent resumed' });
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to resume agent');
        res.status(500).json({ error: 'Failed to resume agent' });
      }
    });

    this.app.post('/api/agents/:id/terminate', async (req: Request, res: Response) => {
      try {
        await this.terminateAgent(req.params.id, req.body.reason || 'Manual termination');
        res.json({ success: true, message: 'Agent terminated' });
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to terminate agent');
        res.status(500).json({ error: 'Failed to terminate agent' });
      }
    });

    // Agent intervention
    this.app.post('/api/agents/:id/intervention', async (req: Request, res: Response) => {
      try {
        const { message, intervention_type } = req.body;
        await this.createIntervention(req.params.id, message, intervention_type);
        res.json({ success: true, message: 'Intervention recorded' });
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to create intervention');
        res.status(500).json({ error: 'Failed to create intervention' });
      }
    });

    // Get agent traces
    this.app.get('/api/agents/:id/traces', async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const traces = await this.getAgentTraces(req.params.id, limit);
        res.json(traces);
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to get traces');
        res.status(500).json({ error: 'Failed to get traces' });
      }
    });

    // Pending approvals
    this.app.get('/api/approvals', async (_req: Request, res: Response) => {
      try {
        const approvals = await this.getPendingApprovals();
        res.json(approvals);
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to get approvals');
        res.status(500).json({ error: 'Failed to get approvals' });
      }
    });

    this.app.post('/api/approvals/:id/approve', async (req: Request, res: Response) => {
      try {
        await this.processApproval(req.params.id, 'approved', req.body.notes);
        res.json({ success: true, message: 'Approval granted' });
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to approve');
        res.status(500).json({ error: 'Failed to process approval' });
      }
    });

    this.app.post('/api/approvals/:id/reject', async (req: Request, res: Response) => {
      try {
        await this.processApproval(req.params.id, 'rejected', req.body.notes);
        res.json({ success: true, message: 'Request rejected' });
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to reject');
        res.status(500).json({ error: 'Failed to process rejection' });
      }
    });

    // Workflows
    this.app.get('/api/workflows', async (_req: Request, res: Response) => {
      try {
        const workflows = await this.getActiveWorkflows();
        res.json(workflows);
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to get workflows');
        res.status(500).json({ error: 'Failed to get workflows' });
      }
    });

    // SSE fallback endpoint
    this.app.get('/api/stream', (req: Request, res: Response) => {
      this.setupSSE(req, res);
    });

    // Notifications
    this.app.get('/api/notifications', async (req: Request, res: Response) => {
      try {
        const userId = req.query.userId as string || 'default';
        const notifications = await this.getNotifications(userId);
        res.json(notifications);
      } catch (error) {
        this.serverLogger.error({ error }, 'Failed to get notifications');
        res.status(500).json({ error: 'Failed to get notifications' });
      }
    });
  }

  // ===========================================================================
  // WebSocket Setup
  // ===========================================================================

  private setupWebSocket(): void {
    this.io.on('connection', (socket: Socket) => {
      this.serverLogger.info({ socketId: socket.id }, 'Dashboard client connected');

      // Subscribe to agent updates
      socket.on('subscribe:agent', (agentId: string) => {
        socket.join(`agent:${agentId}`);
        this.serverLogger.debug({ socketId: socket.id, agentId }, 'Subscribed to agent');
      });

      // Unsubscribe from agent
      socket.on('unsubscribe:agent', (agentId: string) => {
        socket.leave(`agent:${agentId}`);
      });

      // Subscribe to workflow updates
      socket.on('subscribe:workflow', (workflowId: string) => {
        socket.join(`workflow:${workflowId}`);
        this.serverLogger.debug({ socketId: socket.id, workflowId }, 'Subscribed to workflow');
      });

      // Subscribe to all updates (dashboard overview)
      socket.on('subscribe:all', () => {
        socket.join('dashboard');
        this.serverLogger.debug({ socketId: socket.id }, 'Subscribed to dashboard');
      });

      // Agent control commands via WebSocket
      socket.on('agent:pause', async (agentId: string) => {
        try {
          await this.pauseAgent(agentId, 'Dashboard user');
          socket.emit('agent:paused', { agentId, success: true });
        } catch (error) {
          socket.emit('agent:error', { agentId, error: 'Failed to pause agent' });
        }
      });

      socket.on('agent:resume', async (agentId: string) => {
        try {
          await this.resumeAgent(agentId);
          socket.emit('agent:resumed', { agentId, success: true });
        } catch (error) {
          socket.emit('agent:error', { agentId, error: 'Failed to resume agent' });
        }
      });

      socket.on('agent:terminate', async (agentId: string) => {
        try {
          await this.terminateAgent(agentId, 'Dashboard user');
          socket.emit('agent:terminated', { agentId, success: true });
        } catch (error) {
          socket.emit('agent:error', { agentId, error: 'Failed to terminate agent' });
        }
      });

      // Intervention via WebSocket
      socket.on('agent:intervene', async (data: { agentId: string; message: string; type: string }) => {
        try {
          await this.createIntervention(data.agentId, data.message, data.type);
          socket.emit('agent:intervention_sent', { agentId: data.agentId, success: true });
        } catch (error) {
          socket.emit('agent:error', { agentId: data.agentId, error: 'Failed to send intervention' });
        }
      });

      // Disconnect handling
      socket.on('disconnect', () => {
        this.serverLogger.info({ socketId: socket.id }, 'Dashboard client disconnected');
      });
    });
  }

  // ===========================================================================
  // SSE Fallback
  // ===========================================================================

  private setupSSE(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date() })}\n\n`);

    // Poll for updates every 2 seconds
    const interval = setInterval(async () => {
      try {
        const metrics = await this.getSystemMetrics();
        res.write(`data: ${JSON.stringify({ type: 'metrics', data: metrics })}\n\n`);

        // Check for recent events
        const recentEvents = await this.getRecentEvents();
        if (recentEvents.length > 0) {
          res.write(`data: ${JSON.stringify({ type: 'events', data: recentEvents })}\n\n`);
        }
      } catch (error) {
        this.serverLogger.error({ error }, 'SSE polling error');
      }
    }, 2000);

    req.on('close', () => {
      clearInterval(interval);
    });
  }

  // ===========================================================================
  // Data Access Methods
  // ===========================================================================

  private async getSystemMetrics(): Promise<DashboardMetrics> {
    const result = await db.query(`
      SELECT
        COUNT(*) as total_agents,
        COUNT(*) FILTER (WHERE status = 'executing') as active_agents,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_agents,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_agents,
        COUNT(*) FILTER (WHERE control_state = 'paused') as paused_agents,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(AVG(execution_duration_ms), 0) as avg_duration_ms
      FROM agents
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    const approvalCount = await db.query(`
      SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'
    `).catch(() => ({ rows: [{ count: 0 }] }));

    const workflowCount = await db.query(`
      SELECT COUNT(*) as count FROM workflow_graphs WHERE status = 'active'
    `).catch(() => ({ rows: [{ count: 0 }] }));

    const row = result.rows[0];
    return {
      totalAgents: parseInt(row.total_agents) || 0,
      activeAgents: parseInt(row.active_agents) || 0,
      completedAgents: parseInt(row.completed_agents) || 0,
      failedAgents: parseInt(row.failed_agents) || 0,
      pausedAgents: parseInt(row.paused_agents) || 0,
      totalTokensUsed: parseInt(row.total_tokens) || 0,
      avgDurationMs: parseFloat(row.avg_duration_ms) || 0,
      pendingApprovals: parseInt(approvalCount.rows[0]?.count) || 0,
      activeWorkflows: parseInt(workflowCount.rows[0]?.count) || 0,
    };
  }

  private async getAgentsWithMonitoring(limit: number, offset: number, status?: string): Promise<any[]> {
    let query = `
      SELECT
        a.*,
        b.allocated as budget_allocated,
        b.used as budget_used,
        b.reserved as budget_reserved,
        w.worktree_path,
        (SELECT COUNT(*) FROM agent_traces WHERE agent_id = a.id) as trace_count
      FROM agents a
      LEFT JOIN budgets b ON a.id = b.agent_id
      LEFT JOIN workspaces w ON a.id = w.agent_id
    `;

    const params: any[] = [];
    if (status) {
      query += ` WHERE a.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  private async getAgentDetails(agentId: string): Promise<any> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) return null;

    const [budget, traces, decisions, events, interventions] = await Promise.all([
      db.query('SELECT * FROM budgets WHERE agent_id = $1', [agentId]).catch(() => ({ rows: [] })),
      db.query(
        'SELECT * FROM agent_traces WHERE agent_id = $1 ORDER BY trace_index DESC LIMIT 50',
        [agentId]
      ).catch(() => ({ rows: [] })),
      db.query(
        'SELECT * FROM agent_decisions WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT 20',
        [agentId]
      ).catch(() => ({ rows: [] })),
      db.query(
        'SELECT * FROM agent_events WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT 20',
        [agentId]
      ).catch(() => ({ rows: [] })),
      db.query(
        'SELECT * FROM agent_interventions WHERE agent_id = $1 ORDER BY intervened_at DESC',
        [agentId]
      ).catch(() => ({ rows: [] })),
    ]);

    return {
      ...agent,
      budget: budget.rows[0] || null,
      traces: traces.rows,
      decisions: decisions.rows,
      events: events.rows,
      interventions: interventions.rows,
    };
  }

  private async getAgentTraces(agentId: string, limit: number): Promise<any[]> {
    const result = await db.query(
      `SELECT * FROM agent_traces WHERE agent_id = $1 ORDER BY trace_index DESC LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  private async getPendingApprovals(): Promise<any[]> {
    const result = await db.query(`
      SELECT
        ar.*,
        a.role as agent_role,
        a.task_description as agent_task
      FROM approval_requests ar
      LEFT JOIN agents a ON ar.entity_type = 'agent' AND ar.entity_id = a.id
      WHERE ar.status = 'pending'
        AND (ar.expires_at IS NULL OR ar.expires_at > NOW())
      ORDER BY
        CASE ar.risk_level
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        ar.requested_at ASC
    `);
    return result.rows;
  }

  private async getActiveWorkflows(): Promise<any[]> {
    const result = await db.query(`
      SELECT
        g.*,
        COUNT(n.id) as total_nodes,
        COUNT(n.id) FILTER (WHERE n.execution_status = 'completed') as completed_nodes,
        COUNT(n.id) FILTER (WHERE n.execution_status = 'executing') as executing_nodes
      FROM workflow_graphs g
      LEFT JOIN workflow_nodes n ON g.id = n.workflow_graph_id
      WHERE g.status IN ('active', 'pending')
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `);
    return result.rows;
  }

  private async getRecentEvents(): Promise<any[]> {
    const result = await db.query(`
      SELECT * FROM agent_events
      WHERE timestamp > NOW() - INTERVAL '5 seconds'
      ORDER BY timestamp DESC
      LIMIT 10
    `).catch(() => ({ rows: [] }));
    return result.rows;
  }

  private async getNotifications(userId: string): Promise<any[]> {
    const result = await db.query(`
      SELECT * FROM notifications
      WHERE (target_type = 'broadcast' OR target_id = $1)
        AND read_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          ELSE 4
        END,
        created_at DESC
      LIMIT 50
    `, [userId]);
    return result.rows;
  }

  // ===========================================================================
  // Agent Control Methods
  // ===========================================================================

  private async pauseAgent(agentId: string, reason: string): Promise<void> {
    await db.query(`
      UPDATE agents
      SET control_state = 'paused', paused_at = NOW(), pause_reason = $2
      WHERE id = $1
    `, [agentId, reason]);

    await this.recordControlCommand(agentId, 'pause', reason);
    this.broadcastAgentUpdate(agentId, 'paused');
  }

  private async resumeAgent(agentId: string): Promise<void> {
    await db.query(`
      UPDATE agents
      SET control_state = 'running', paused_at = NULL, pause_reason = NULL
      WHERE id = $1
    `, [agentId]);

    await this.recordControlCommand(agentId, 'resume', 'Manual resume');
    this.broadcastAgentUpdate(agentId, 'resumed');
  }

  private async terminateAgent(agentId: string, reason: string): Promise<void> {
    await db.query(`
      UPDATE agents
      SET control_state = 'terminated', status = 'failed'
      WHERE id = $1
    `, [agentId]);

    await this.recordControlCommand(agentId, 'terminate', reason);
    this.broadcastAgentUpdate(agentId, 'terminated');
  }

  private async recordControlCommand(agentId: string, commandType: string, reason: string): Promise<void> {
    await db.query(`
      INSERT INTO agent_control_commands (agent_id, command_type, issued_by, status, executed_at, metadata)
      VALUES ($1, $2, 'dashboard', 'executed', NOW(), $3)
    `, [agentId, commandType, JSON.stringify({ reason })]);
  }

  private async createIntervention(agentId: string, message: string, type: string): Promise<void> {
    await db.query(`
      INSERT INTO agent_interventions (agent_id, intervention_type, intervened_by, message)
      VALUES ($1, $2, 'dashboard_user', $3)
    `, [agentId, type || 'guidance', message]);

    // Broadcast intervention to agent subscribers
    this.io.to(`agent:${agentId}`).emit('agent:intervention', {
      agentId,
      type,
      message,
      timestamp: new Date(),
    });
  }

  private async processApproval(approvalId: string, decision: string, notes?: string): Promise<void> {
    await db.query(`
      UPDATE approval_requests
      SET status = $2, reviewed_by = 'dashboard_user', reviewed_at = NOW(), review_notes = $3
      WHERE id = $1
    `, [approvalId, decision, notes || null]);

    // Broadcast approval decision
    this.io.to('dashboard').emit('approval:processed', {
      approvalId,
      decision,
      timestamp: new Date(),
    });
  }

  // ===========================================================================
  // Broadcast Methods
  // ===========================================================================

  private broadcastAgentUpdate(agentId: string, event: string, data?: any): void {
    const payload = { agentId, event, data, timestamp: new Date() };
    this.io.to(`agent:${agentId}`).emit('agent:update', payload);
    this.io.to('dashboard').emit('agent:update', payload);
  }

  public broadcastMetrics(metrics: DashboardMetrics): void {
    this.io.to('dashboard').emit('metrics:update', metrics);
  }

  public broadcastTrace(trace: TraceUpdate): void {
    this.io.to(`agent:${trace.agentId}`).emit('agent:trace', trace);
  }

  public broadcastNotification(notification: any): void {
    this.io.to('dashboard').emit('notification', notification);
  }

  // ===========================================================================
  // Server Lifecycle
  // ===========================================================================

  async start(): Promise<void> {
    await db.initialize();

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        this.serverLogger.info({ port: this.port }, 'MonitoringServerV2 started');

        // Start metrics broadcasting (every 2 seconds)
        this.metricsInterval = setInterval(async () => {
          try {
            const metrics = await this.getSystemMetrics();
            this.broadcastMetrics(metrics);
          } catch (error) {
            this.serverLogger.error({ error }, 'Failed to broadcast metrics');
          }
        }, 2000);

        // Start polling for agent updates (every 1 second)
        this.pollingInterval = setInterval(async () => {
          try {
            const events = await this.getRecentEvents();
            if (events.length > 0) {
              events.forEach(event => {
                this.broadcastAgentUpdate(event.agent_id, event.event_type, event);
              });
            }
          } catch (error) {
            // Silently ignore polling errors
          }
        }, 1000);

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    return new Promise((resolve) => {
      this.io.close(() => {
        this.server.close(() => {
          this.serverLogger.info('MonitoringServerV2 stopped');
          resolve();
        });
      });
    });
  }

  // ===========================================================================
  // Dashboard HTML
  // ===========================================================================

  private getDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multi-Agent Dashboard v2</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    h1 { color: #58a6ff; }
    .status { padding: 8px 16px; border-radius: 20px; font-size: 14px; }
    .status.connected { background: #238636; color: white; }
    .status.disconnected { background: #da3633; color: white; }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .metric-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
    .metric-value { font-size: 32px; font-weight: bold; color: #58a6ff; }
    .metric-label { font-size: 14px; color: #8b949e; margin-top: 4px; }
    .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .section-title { font-size: 18px; margin-bottom: 16px; color: #c9d1d9; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #30363d; }
    th { background: #0d1117; color: #8b949e; font-weight: 500; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge.executing { background: #1f6feb; color: white; }
    .badge.completed { background: #238636; color: white; }
    .badge.failed { background: #da3633; color: white; }
    .badge.pending { background: #6e7681; color: white; }
    .badge.paused { background: #f0883e; color: black; }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 4px; }
    .btn-pause { background: #f0883e; color: black; }
    .btn-resume { background: #238636; color: white; }
    .btn-terminate { background: #da3633; color: white; }
    #events { max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 13px; background: #0d1117; padding: 12px; border-radius: 4px; }
    .event { padding: 4px 0; border-bottom: 1px solid #21262d; }
    .event-time { color: #6e7681; }
    .event-type { color: #58a6ff; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 Multi-Agent Dashboard v2</h1>
      <span id="connection-status" class="status disconnected">Disconnected</span>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value" id="active-agents">0</div>
        <div class="metric-label">Active Agents</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" id="completed-agents">0</div>
        <div class="metric-label">Completed</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" id="failed-agents">0</div>
        <div class="metric-label">Failed</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" id="total-tokens">0</div>
        <div class="metric-label">Tokens Used (24h)</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" id="pending-approvals">0</div>
        <div class="metric-label">Pending Approvals</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" id="active-workflows">0</div>
        <div class="metric-label">Active Workflows</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Recent Agents</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Role</th>
            <th>Status</th>
            <th>Control</th>
            <th>Tokens</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="agents-table">
          <tr><td colspan="6">Loading...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">Live Events</h2>
      <div id="events"></div>
    </div>
  </div>

  <script>
    const socket = io();
    const statusEl = document.getElementById('connection-status');
    const eventsEl = document.getElementById('events');

    socket.on('connect', () => {
      statusEl.textContent = 'Connected';
      statusEl.className = 'status connected';
      socket.emit('subscribe:all');
      fetchAgents();
    });

    socket.on('disconnect', () => {
      statusEl.textContent = 'Disconnected';
      statusEl.className = 'status disconnected';
    });

    socket.on('metrics:update', (metrics) => {
      document.getElementById('active-agents').textContent = metrics.activeAgents;
      document.getElementById('completed-agents').textContent = metrics.completedAgents;
      document.getElementById('failed-agents').textContent = metrics.failedAgents;
      document.getElementById('total-tokens').textContent = metrics.totalTokensUsed.toLocaleString();
      document.getElementById('pending-approvals').textContent = metrics.pendingApprovals;
      document.getElementById('active-workflows').textContent = metrics.activeWorkflows;
    });

    socket.on('agent:update', (data) => {
      addEvent(\`Agent \${data.agentId.slice(0,8)}... \${data.event}\`);
      fetchAgents();
    });

    function addEvent(text) {
      const time = new Date().toLocaleTimeString();
      const div = document.createElement('div');
      div.className = 'event';
      div.innerHTML = \`<span class="event-time">\${time}</span> <span class="event-type">\${text}</span>\`;
      eventsEl.insertBefore(div, eventsEl.firstChild);
      if (eventsEl.children.length > 50) eventsEl.removeChild(eventsEl.lastChild);
    }

    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents?limit=10');
        const agents = await res.json();
        const tbody = document.getElementById('agents-table');
        tbody.innerHTML = agents.map(a => \`
          <tr>
            <td>\${a.id.slice(0,8)}...</td>
            <td>\${a.role}</td>
            <td><span class="badge \${a.status}">\${a.status}</span></td>
            <td><span class="badge \${a.control_state || 'running'}">\${a.control_state || 'running'}</span></td>
            <td>\${(a.tokens_used || 0).toLocaleString()}</td>
            <td>
              \${a.control_state === 'paused'
                ? \`<button class="btn btn-resume" onclick="resumeAgent('\${a.id}')">Resume</button>\`
                : \`<button class="btn btn-pause" onclick="pauseAgent('\${a.id}')">Pause</button>\`
              }
              <button class="btn btn-terminate" onclick="terminateAgent('\${a.id}')">Terminate</button>
            </td>
          </tr>
        \`).join('');
      } catch (e) {
        console.error('Failed to fetch agents:', e);
      }
    }

    function pauseAgent(id) {
      socket.emit('agent:pause', id);
    }

    function resumeAgent(id) {
      socket.emit('agent:resume', id);
    }

    function terminateAgent(id) {
      if (confirm('Are you sure you want to terminate this agent?')) {
        socket.emit('agent:terminate', id);
      }
    }

    // Initial fetch
    fetch('/api/metrics').then(r => r.json()).then(m => {
      document.getElementById('active-agents').textContent = m.activeAgents;
      document.getElementById('completed-agents').textContent = m.completedAgents;
      document.getElementById('failed-agents').textContent = m.failedAgents;
      document.getElementById('total-tokens').textContent = m.totalTokensUsed.toLocaleString();
      document.getElementById('pending-approvals').textContent = m.pendingApprovals;
      document.getElementById('active-workflows').textContent = m.activeWorkflows;
    });
  </script>
</body>
</html>
`;
  }
}

// Run if executed directly
if (process.argv[1]?.includes('MonitoringServerV2')) {
  const server = new MonitoringServerV2(3001);
  server.start().then(() => {
    console.log('Dashboard server running at http://localhost:3001');
  });
}
