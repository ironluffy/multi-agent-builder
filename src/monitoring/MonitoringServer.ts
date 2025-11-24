/**
 * MonitoringServer - HTTP API for agent monitoring
 *
 * Provides REST endpoints and Server-Sent Events for real-time monitoring
 * of agent execution, traces, decisions, and tool usage.
 */

import http from 'http';
import { URL } from 'url';
import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';
import { AgentTracer } from './AgentTracer.js';

export class MonitoringServer {
  private port: number;
  private server: http.Server | null = null;
  private serverLogger = logger.child({ component: 'MonitoringServer' });

  constructor(port: number = 3001) {
    this.port = port;
  }

  /**
   * Start the monitoring server
   */
  async start(): Promise<void> {
    await db.initialize();

    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    this.server.listen(this.port, () => {
      this.serverLogger.info({ port: this.port }, 'Monitoring server started');
      console.log(`🖥️  Monitoring server listening on http://localhost:${this.port}`);
      console.log(`   - GET /agents - List all agents`);
      console.log(`   - GET /agents/:id - Get agent details`);
      console.log(`   - GET /stream - Real-time event stream`);
    });
  }

  /**
   * Stop the monitoring server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    await db.shutdown();
    this.serverLogger.info('Monitoring server stopped');
  }

  /**
   * Handle HTTP request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      if (pathname === '/agents') {
        await this.handleGetAgents(res);
      } else if (pathname.startsWith('/agents/')) {
        const agentId = pathname.split('/')[2];
        await this.handleGetAgentDetails(agentId, res);
      } else if (pathname === '/stream') {
        await this.handleEventStream(req, res);
      } else if (pathname === '/') {
        await this.handleRoot(res);
      } else {
        this.sendJSON(res, 404, { error: 'Not found' });
      }
    } catch (error) {
      this.serverLogger.error({ error, pathname }, 'Request handler error');
      this.sendJSON(res, 500, { error: 'Internal server error' });
    }
  }

  /**
   * Handle GET /agents
   */
  private async handleGetAgents(res: http.ServerResponse): Promise<void> {
    const result = await db.query(`
      SELECT * FROM agent_monitoring_view
      ORDER BY created_at DESC
    `);

    this.sendJSON(res, 200, result.rows);
  }

  /**
   * Handle GET /agents/:id
   */
  private async handleGetAgentDetails(agentId: string, res: http.ServerResponse): Promise<void> {
    // Fetch agent summary
    const agent = await AgentTracer.getAgentSummary(agentId);
    if (!agent) {
      this.sendJSON(res, 404, { error: 'Agent not found' });
      return;
    }

    // Fetch traces
    const traces = await AgentTracer.getAgentTraces(agentId, 100);

    // Fetch tool usage
    const toolUsage = await AgentTracer.getAgentToolUsage(agentId, 50);

    // Fetch decisions
    const decisions = await AgentTracer.getAgentDecisions(agentId, 50);

    // Fetch events
    const events = await AgentTracer.getAgentEvents(agentId, 100);

    this.sendJSON(res, 200, {
      agent,
      traces,
      tool_usage: toolUsage,
      decisions,
      events,
    });
  }

  /**
   * Handle GET /stream - Server-Sent Events
   */
  private async handleEventStream(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial data
    const agents = await db.query('SELECT * FROM agent_monitoring_view ORDER BY created_at DESC');
    this.sendSSE(res, 'init', { agents: agents.rows });

    // Poll for updates every 2 seconds
    const interval = setInterval(async () => {
      try {
        // Get recent events (last 3 seconds)
        const recentEvents = await db.query(
          `SELECT * FROM agent_events
           WHERE timestamp > NOW() - INTERVAL '3 seconds'
           ORDER BY timestamp DESC`
        );

        if (recentEvents.rows.length > 0) {
          this.sendSSE(res, 'events', { events: recentEvents.rows });
        }

        // Get agent updates
        const agents = await db.query(
          `SELECT * FROM agent_monitoring_view
           WHERE updated_at > NOW() - INTERVAL '3 seconds'
           ORDER BY updated_at DESC`
        );

        if (agents.rows.length > 0) {
          this.sendSSE(res, 'agents_updated', { agents: agents.rows });
        }
      } catch (error) {
        this.serverLogger.error({ error }, 'Error in SSE stream');
      }
    }, 2000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  }

  /**
   * Handle GET / - Root endpoint with API info
   */
  private async handleRoot(res: http.ServerResponse): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Multi-Agent Monitoring API</title>
  <style>
    body { font-family: monospace; padding: 20px; }
    h1 { color: #333; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    .endpoint { margin: 10px 0; }
  </style>
</head>
<body>
  <h1>🤖 Multi-Agent System Monitoring API</h1>
  <p>Available endpoints:</p>
  <div class="endpoint"><code>GET /agents</code> - List all agents</div>
  <div class="endpoint"><code>GET /agents/:id</code> - Get agent details with traces</div>
  <div class="endpoint"><code>GET /stream</code> - Real-time event stream (SSE)</div>
  <h2>Example Usage:</h2>
  <pre>
curl http://localhost:${this.port}/agents
curl http://localhost:${this.port}/agents/[agent-id]
curl http://localhost:${this.port}/stream
  </pre>
</body>
</html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Send JSON response
   */
  private sendJSON(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send Server-Sent Event
   */
  private sendSSE(res: http.ServerResponse, event: string, data: any): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// Allow running directly from command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MonitoringServer(3001);
  server.start().catch((error) => {
    console.error('Failed to start monitoring server:', error);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n Shutting down monitoring server...');
    await server.stop();
    process.exit(0);
  });
}
