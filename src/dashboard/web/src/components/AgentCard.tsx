import { useState } from 'react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import {
  Pause,
  Play,
  XCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import type { Agent } from '../types';
import { useSocketStore } from '../stores/socketStore';

interface AgentCardProps {
  agent: Agent;
  showControls?: boolean;
}

export default function AgentCard({ agent, showControls = true }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { pauseAgent, resumeAgent, terminateAgent, subscribeToAgent } = useSocketStore();
  const [controlLoading, setControlLoading] = useState<string | null>(null);

  const handlePause = async () => {
    setControlLoading('pause');
    try {
      await pauseAgent(agent.id);
      subscribeToAgent(agent.id);
    } finally {
      setControlLoading(null);
    }
  };

  const handleResume = async () => {
    setControlLoading('resume');
    try {
      await resumeAgent(agent.id);
    } finally {
      setControlLoading(null);
    }
  };

  const handleTerminate = async () => {
    if (confirm('Are you sure you want to terminate this agent?')) {
      setControlLoading('terminate');
      try {
        await terminateAgent(agent.id);
      } finally {
        setControlLoading(null);
      }
    }
  };

  const budgetPercent = agent.budget_allocated > 0
    ? Math.round((agent.tokens_used / agent.budget_allocated) * 100)
    : 0;

  const canControl = agent.status === 'executing';

  return (
    <div className="card">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-medium text-gray-900 truncate">
                {agent.role}
              </h3>
              <StatusBadge status={agent.status} size="sm" />
              {agent.control_state && agent.control_state !== 'running' && (
                <StatusBadge status={agent.control_state} size="sm" />
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
              {agent.task_description}
            </p>
          </div>

          {showControls && canControl && (
            <div className="flex items-center space-x-1 ml-4">
              {agent.control_state === 'paused' ? (
                <button
                  onClick={handleResume}
                  disabled={controlLoading === 'resume'}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-md transition-colors disabled:opacity-50"
                  title="Resume"
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  disabled={controlLoading === 'pause'}
                  className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-md transition-colors disabled:opacity-50"
                  title="Pause"
                >
                  <Pause className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleTerminate}
                disabled={controlLoading === 'terminate'}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                title="Terminate"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {formatDistanceToNow(new Date(agent.spawned_at), { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <Coins className="w-3.5 h-3.5" />
            <span>
              {agent.tokens_used.toLocaleString()} / {agent.budget_allocated.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Budget bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">Token usage</span>
            <span className={clsx(
              'font-medium',
              budgetPercent >= 90 ? 'text-red-600' :
              budgetPercent >= 70 ? 'text-yellow-600' : 'text-gray-600'
            )}>
              {budgetPercent}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={clsx(
                'h-1.5 rounded-full transition-all',
                budgetPercent >= 90 ? 'bg-red-500' :
                budgetPercent >= 70 ? 'bg-yellow-500' : 'bg-primary-500'
              )}
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Expand/collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-1" />
              Less details
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-1" />
              More details
            </>
          )}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 text-xs">
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-gray-500">Agent ID</dt>
              <dd className="text-gray-900 font-mono">{agent.id.slice(0, 8)}...</dd>
            </div>
            {agent.parent_id && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Parent ID</dt>
                <dd className="text-gray-900 font-mono">{agent.parent_id.slice(0, 8)}...</dd>
              </div>
            )}
            {agent.completed_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Completed</dt>
                <dd className="text-gray-900">
                  {formatDistanceToNow(new Date(agent.completed_at), { addSuffix: true })}
                </dd>
              </div>
            )}
            {agent.result && (
              <div className="mt-2">
                <dt className="text-gray-500 mb-1">Result</dt>
                <dd className="text-gray-900 bg-white p-2 rounded border border-gray-200 max-h-32 overflow-auto">
                  {agent.result}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
