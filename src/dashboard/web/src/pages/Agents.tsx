import { useState, useMemo } from 'react';
import { Search, Filter, Bot, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import AgentCard from '../components/AgentCard';
import StatusBadge from '../components/StatusBadge';
import { useAgents } from '../hooks/useApi';
import type { AgentStatus } from '../types';

const statusFilters: { value: AgentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'executing', label: 'Executing' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export default function Agents() {
  const { data, loading, refetch } = useAgents(5000);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AgentStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'tokens' | 'role'>('recent');

  const agents = data?.agents || [];

  const filteredAgents = useMemo(() => {
    let result = [...agents];

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(a => a.status === statusFilter);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        a =>
          a.role.toLowerCase().includes(query) ||
          a.task_description.toLowerCase().includes(query) ||
          a.id.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (sortBy) {
      case 'recent':
        result.sort((a, b) =>
          new Date(b.spawned_at).getTime() - new Date(a.spawned_at).getTime()
        );
        break;
      case 'tokens':
        result.sort((a, b) => b.tokens_used - a.tokens_used);
        break;
      case 'role':
        result.sort((a, b) => a.role.localeCompare(b.role));
        break;
    }

    return result;
  }, [agents, statusFilter, searchQuery, sortBy]);

  const statusCounts = useMemo(() => {
    return agents.reduce((acc, agent) => {
      acc[agent.status] = (acc[agent.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [agents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and control your AI agents
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

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by role, task, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <div className="flex space-x-1">
              {statusFilters.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={clsx(
                    'px-3 py-1.5 text-sm rounded-lg transition-colors',
                    statusFilter === value
                      ? 'bg-primary-100 text-primary-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {label}
                  {value !== 'all' && statusCounts[value] !== undefined && (
                    <span className="ml-1.5 text-xs opacity-60">
                      ({statusCounts[value] || 0})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="recent">Most Recent</option>
            <option value="tokens">Token Usage</option>
            <option value="role">Role (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Agent grid */}
      {loading && agents.length === 0 ? (
        <div className="card p-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto text-gray-300 animate-spin" />
          <p className="mt-4 text-gray-500">Loading agents...</p>
        </div>
      ) : filteredAgents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <Bot className="w-12 h-12 mx-auto text-gray-300" />
          <p className="mt-4 text-gray-500">
            {searchQuery || statusFilter !== 'all'
              ? 'No agents match your filters'
              : 'No agents yet'}
          </p>
          {(searchQuery || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="mt-2 text-sm text-primary-600 hover:text-primary-700"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Showing {filteredAgents.length} of {agents.length} agents
          </span>
          <div className="flex items-center space-x-4">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center space-x-1.5">
                <StatusBadge status={status as AgentStatus} size="sm" />
                <span className="text-gray-600">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
