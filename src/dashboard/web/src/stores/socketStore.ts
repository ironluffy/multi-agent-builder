import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { Agent, WorkflowGraph, ApprovalRequest, SystemMetrics, Notification } from '../types';

interface SocketState {
  socket: Socket | null;
  connected: boolean;
  error: string | null;

  // Real-time data
  agents: Map<string, Agent>;
  workflows: Map<string, WorkflowGraph>;
  approvals: ApprovalRequest[];
  notifications: Notification[];
  metrics: SystemMetrics | null;

  // Subscriptions
  subscribedAgents: Set<string>;
  subscribedWorkflows: Set<string>;

  // Actions
  connect: () => void;
  disconnect: () => void;
  subscribeToAgent: (agentId: string) => void;
  unsubscribeFromAgent: (agentId: string) => void;
  subscribeToWorkflow: (workflowId: string) => void;
  unsubscribeFromWorkflow: (workflowId: string) => void;

  // Agent control
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  terminateAgent: (agentId: string) => Promise<void>;

  // Approval actions
  approveRequest: (requestId: string, comment?: string) => Promise<void>;
  rejectRequest: (requestId: string, reason: string) => Promise<void>;

  // Notification actions
  markNotificationRead: (notificationId: string) => void;
  clearNotifications: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  connected: false,
  error: null,

  agents: new Map(),
  workflows: new Map(),
  approvals: [],
  notifications: [],
  metrics: null,

  subscribedAgents: new Set(),
  subscribedWorkflows: new Set(),

  connect: () => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      set({ connected: true, error: null });
      console.log('[WebSocket] Connected');

      // Resubscribe to existing subscriptions
      const { subscribedAgents, subscribedWorkflows } = get();
      subscribedAgents.forEach(id => socket.emit('subscribe:agent', id));
      subscribedWorkflows.forEach(id => socket.emit('subscribe:workflow', id));
    });

    socket.on('disconnect', () => {
      set({ connected: false });
      console.log('[WebSocket] Disconnected');
    });

    socket.on('connect_error', (error) => {
      set({ error: error.message });
      console.error('[WebSocket] Connection error:', error);
    });

    // Agent updates
    socket.on('agent:update', (agent: Agent) => {
      set(state => {
        const agents = new Map(state.agents);
        agents.set(agent.id, agent);
        return { agents };
      });
    });

    socket.on('agent:completed', (agent: Agent) => {
      set(state => {
        const agents = new Map(state.agents);
        agents.set(agent.id, agent);
        return { agents };
      });
    });

    socket.on('agent:spawned', (agent: Agent) => {
      set(state => {
        const agents = new Map(state.agents);
        agents.set(agent.id, agent);
        return { agents };
      });
    });

    // Workflow updates
    socket.on('workflow:update', (workflow: WorkflowGraph) => {
      set(state => {
        const workflows = new Map(state.workflows);
        workflows.set(workflow.id, workflow);
        return { workflows };
      });
    });

    // Approval updates
    socket.on('approval:created', (approval: ApprovalRequest) => {
      set(state => ({
        approvals: [approval, ...state.approvals],
        notifications: [{
          id: `notif-${Date.now()}`,
          title: 'New Approval Request',
          message: approval.title,
          notification_type: 'action_required',
          priority: approval.priority > 5 ? 'high' : 'normal',
          created_at: new Date().toISOString(),
          read_at: null,
          action_url: `/approvals/${approval.id}`,
          agent_id: approval.requester_agent_id,
          workflow_id: approval.workflow_graph_id,
        }, ...state.notifications],
      }));
    });

    socket.on('approval:updated', (approval: ApprovalRequest) => {
      set(state => ({
        approvals: state.approvals.map(a =>
          a.id === approval.id ? approval : a
        ),
      }));
    });

    // Metrics updates
    socket.on('metrics:update', (metrics: SystemMetrics) => {
      set({ metrics });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  subscribeToAgent: (agentId: string) => {
    const { socket, subscribedAgents } = get();
    if (socket && !subscribedAgents.has(agentId)) {
      socket.emit('subscribe:agent', agentId);
      set({ subscribedAgents: new Set(subscribedAgents).add(agentId) });
    }
  },

  unsubscribeFromAgent: (agentId: string) => {
    const { socket, subscribedAgents } = get();
    if (socket && subscribedAgents.has(agentId)) {
      socket.emit('unsubscribe:agent', agentId);
      const newSet = new Set(subscribedAgents);
      newSet.delete(agentId);
      set({ subscribedAgents: newSet });
    }
  },

  subscribeToWorkflow: (workflowId: string) => {
    const { socket, subscribedWorkflows } = get();
    if (socket && !subscribedWorkflows.has(workflowId)) {
      socket.emit('subscribe:workflow', workflowId);
      set({ subscribedWorkflows: new Set(subscribedWorkflows).add(workflowId) });
    }
  },

  unsubscribeFromWorkflow: (workflowId: string) => {
    const { socket, subscribedWorkflows } = get();
    if (socket && subscribedWorkflows.has(workflowId)) {
      socket.emit('unsubscribe:workflow', workflowId);
      const newSet = new Set(subscribedWorkflows);
      newSet.delete(workflowId);
      set({ subscribedWorkflows: newSet });
    }
  },

  pauseAgent: async (agentId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('agent:pause', agentId);
    }
  },

  resumeAgent: async (agentId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('agent:resume', agentId);
    }
  },

  terminateAgent: async (agentId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('agent:terminate', agentId);
    }
  },

  approveRequest: async (requestId: string, comment?: string) => {
    const response = await fetch(`/api/approvals/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment, approved_by: 'dashboard_user' }),
    });

    if (!response.ok) {
      throw new Error('Failed to approve request');
    }
  },

  rejectRequest: async (requestId: string, reason: string) => {
    const response = await fetch(`/api/approvals/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, rejected_by: 'dashboard_user' }),
    });

    if (!response.ok) {
      throw new Error('Failed to reject request');
    }
  },

  markNotificationRead: (notificationId: string) => {
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
      ),
    }));
  },

  clearNotifications: () => {
    set({ notifications: [] });
  },
}));
