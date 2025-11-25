import { useState } from 'react';
import { GitBranch, RefreshCw, Play, Pause, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import { useWorkflows } from '../hooks/useApi';
import type { WorkflowGraph, WorkflowStatus } from '../types';

export default function Workflows() {
  const { data, loading, refetch } = useWorkflows(5000);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowGraph | null>(null);

  const workflows = data?.workflows || [];

  const getStatusColor = (status: WorkflowStatus) => {
    switch (status) {
      case 'active':
        return 'border-blue-500';
      case 'completed':
        return 'border-green-500';
      case 'failed':
        return 'border-red-500';
      case 'paused':
        return 'border-purple-500';
      default:
        return 'border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and monitor multi-agent workflows
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="btn btn-secondary flex items-center space-x-2"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Workflow list */}
      {loading && workflows.length === 0 ? (
        <div className="card p-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto text-gray-300 animate-spin" />
          <p className="mt-4 text-gray-500">Loading workflows...</p>
        </div>
      ) : workflows.length > 0 ? (
        <div className="space-y-4">
          {workflows.map((workflow) => (
            <div
              key={workflow.id}
              className={clsx(
                'card p-5 border-l-4 transition-shadow hover:shadow-md cursor-pointer',
                getStatusColor(workflow.status)
              )}
              onClick={() => setSelectedWorkflow(workflow)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <GitBranch className="w-5 h-5 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900">
                      {workflow.name}
                    </h3>
                    <StatusBadge status={workflow.status} />
                  </div>
                  {workflow.description && (
                    <p className="mt-2 text-sm text-gray-500">
                      {workflow.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
                    <span>
                      {workflow.nodes?.length || 0} nodes
                    </span>
                    <span>•</span>
                    <span>
                      Created {formatDistanceToNow(new Date(workflow.created_at), { addSuffix: true })}
                    </span>
                    <span>•</span>
                    <span>
                      Updated {formatDistanceToNow(new Date(workflow.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {workflow.status === 'active' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: Implement pause
                      }}
                      className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg"
                      title="Pause workflow"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  {workflow.status === 'paused' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: Implement resume
                      }}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                      title="Resume workflow"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedWorkflow(workflow);
                    }}
                    className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                    title="View details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Node status summary */}
              {workflow.nodes && workflow.nodes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center space-x-6">
                    {['pending', 'executing', 'completed', 'failed'].map(status => {
                      const count = workflow.nodes.filter(n => n.status === status).length;
                      if (count === 0) return null;
                      return (
                        <div key={status} className="flex items-center space-x-1.5">
                          <StatusBadge status={status as any} size="sm" />
                          <span className="text-sm text-gray-600">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <GitBranch className="w-12 h-12 mx-auto text-gray-300" />
          <p className="mt-4 text-gray-500">No workflows yet</p>
          <p className="text-sm text-gray-400">
            Workflows will appear here when created
          </p>
        </div>
      )}

      {/* Workflow detail modal */}
      {selectedWorkflow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <GitBranch className="w-6 h-6 text-gray-400" />
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedWorkflow.name}
                  </h2>
                  <StatusBadge status={selectedWorkflow.status} />
                </div>
                <button
                  onClick={() => setSelectedWorkflow(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 overflow-auto max-h-[60vh]">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Workflow Nodes
              </h3>
              <div className="space-y-3">
                {selectedWorkflow.nodes?.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {node.name}
                        </span>
                        <StatusBadge status={node.status} size="sm" />
                      </div>
                      {node.role && (
                        <p className="text-sm text-gray-500 mt-1">
                          Role: {node.role}
                        </p>
                      )}
                      {node.task_description && (
                        <p className="text-sm text-gray-500 mt-1">
                          {node.task_description}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {node.node_type}
                    </div>
                  </div>
                ))}
                {(!selectedWorkflow.nodes || selectedWorkflow.nodes.length === 0) && (
                  <p className="text-sm text-gray-500">No nodes in this workflow</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
