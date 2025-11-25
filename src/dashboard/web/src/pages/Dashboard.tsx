import {
  Bot,
  GitBranch,
  CheckCircle,
  Coins,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import MetricCard from '../components/MetricCard';
import AgentCard from '../components/AgentCard';
import StatusBadge from '../components/StatusBadge';
import { useMetrics, useAgents, useApprovals } from '../hooks/useApi';

export default function Dashboard() {
  const { data: metricsData } = useMetrics(3000);
  const { data: agentsData } = useAgents(5000);
  const { data: approvalsData } = useApprovals(5000);

  // Get active agents
  const activeAgents = agentsData?.agents?.filter(
    a => a.status === 'executing'
  ) || [];

  // Get pending approvals
  const pendingApprovals = approvalsData?.approvals?.filter(
    a => a.status === 'pending'
  ) || [];

  // Map API response (camelCase) to expected format
  const metrics = {
    activeAgents: metricsData?.activeAgents ?? 0,
    activeWorkflows: metricsData?.activeWorkflows ?? 0,
    pendingApprovals: metricsData?.pendingApprovals ?? 0,
    totalTokensUsed: metricsData?.totalTokensUsed ?? 0,
    completedAgents: metricsData?.completedAgents ?? 0,
    failedAgents: metricsData?.failedAgents ?? 0,
    pausedAgents: metricsData?.pausedAgents ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Real-time overview of your multi-agent orchestration system
        </p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Agents"
          value={metrics.activeAgents}
          icon={<Bot className="w-6 h-6" />}
          color="blue"
        />
        <MetricCard
          title="Active Workflows"
          value={metrics.activeWorkflows}
          icon={<GitBranch className="w-6 h-6" />}
          color="purple"
        />
        <MetricCard
          title="Pending Approvals"
          value={metrics.pendingApprovals}
          icon={<CheckCircle className="w-6 h-6" />}
          color={metrics.pendingApprovals > 0 ? 'yellow' : 'green'}
        />
        <MetricCard
          title="Tokens Used"
          value={metrics.totalTokensUsed.toLocaleString()}
          icon={<Coins className="w-6 h-6" />}
          color="green"
        />
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent status breakdown */}
        <div className="card p-5">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-gray-400" />
            Agent Status Breakdown
          </h2>
          <div className="space-y-3">
            {metrics.activeAgents > 0 && (
              <div className="flex items-center justify-between">
                <StatusBadge status="executing" />
                <span className="text-sm font-medium text-gray-900">{metrics.activeAgents}</span>
              </div>
            )}
            {metrics.completedAgents > 0 && (
              <div className="flex items-center justify-between">
                <StatusBadge status="completed" />
                <span className="text-sm font-medium text-gray-900">{metrics.completedAgents}</span>
              </div>
            )}
            {metrics.failedAgents > 0 && (
              <div className="flex items-center justify-between">
                <StatusBadge status="failed" />
                <span className="text-sm font-medium text-gray-900">{metrics.failedAgents}</span>
              </div>
            )}
            {metrics.pausedAgents > 0 && (
              <div className="flex items-center justify-between">
                <StatusBadge status="paused" />
                <span className="text-sm font-medium text-gray-900">{metrics.pausedAgents}</span>
              </div>
            )}
            {metrics.activeAgents === 0 && metrics.completedAgents === 0 &&
             metrics.failedAgents === 0 && metrics.pausedAgents === 0 && (
              <p className="text-sm text-gray-500">No agents yet</p>
            )}
          </div>
        </div>

        {/* Pending approvals */}
        <div className="card p-5">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" />
            Pending Approvals
          </h2>
          <div className="space-y-3">
            {pendingApprovals.slice(0, 5).map((approval) => (
              <div
                key={approval.id}
                className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {approval.title}
                  </p>
                  <p className="text-xs text-gray-500">{approval.request_type}</p>
                </div>
                <button className="btn btn-primary text-xs px-3 py-1">
                  Review
                </button>
              </div>
            ))}
            {pendingApprovals.length === 0 && (
              <p className="text-sm text-gray-500">No pending approvals</p>
            )}
            {pendingApprovals.length > 5 && (
              <a
                href="/approvals"
                className="block text-sm text-primary-600 hover:text-primary-700 text-center pt-2"
              >
                View all {pendingApprovals.length} approvals →
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Active agents */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Active Agents ({activeAgents.length})
        </h2>
        {activeAgents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeAgents.slice(0, 6).map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center">
            <Bot className="w-12 h-12 mx-auto text-gray-300" />
            <p className="mt-4 text-gray-500">No active agents</p>
            <p className="text-sm text-gray-400">
              Agents will appear here when they start executing
            </p>
          </div>
        )}
        {activeAgents.length > 6 && (
          <div className="mt-4 text-center">
            <a
              href="/agents"
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              View all {activeAgents.length} active agents →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
