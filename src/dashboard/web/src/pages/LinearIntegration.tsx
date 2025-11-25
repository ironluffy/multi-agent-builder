import { useState } from 'react';
import {
  Link as LinkIcon,
  RefreshCw,
  Settings,
  Plus,
  ExternalLink,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import { useLinearMappings, useDelegationRules } from '../hooks/useApi';
import type { LinearMapping, DelegationRule } from '../types';

export default function LinearIntegration() {
  const { data: mappingsData, loading: mappingsLoading, refetch: refetchMappings } = useLinearMappings(10000);
  const { data: rulesData, loading: rulesLoading, refetch: refetchRules } = useDelegationRules(30000);
  const [activeTab, setActiveTab] = useState<'mappings' | 'rules'>('mappings');

  const mappings = mappingsData?.mappings || [];
  const rules = rulesData?.rules || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Linear Integration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage Linear webhooks and delegation rules
          </p>
        </div>
        <button className="btn btn-primary flex items-center space-x-2">
          <Plus className="w-4 h-4" />
          <span>Add Rule</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('mappings')}
            className={clsx(
              'py-4 px-1 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'mappings'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            Issue Mappings
            <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
              {mappings.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={clsx(
              'py-4 px-1 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'rules'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            Delegation Rules
            <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
              {rules.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Mappings tab */}
      {activeTab === 'mappings' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => refetchMappings()}
              disabled={mappingsLoading}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <RefreshCw className={clsx('w-4 h-4', mappingsLoading && 'animate-spin')} />
              <span>Refresh</span>
            </button>
          </div>

          {mappingsLoading && mappings.length === 0 ? (
            <div className="card p-8 text-center">
              <RefreshCw className="w-8 h-8 mx-auto text-gray-300 animate-spin" />
              <p className="mt-4 text-gray-500">Loading mappings...</p>
            </div>
          ) : mappings.length > 0 ? (
            <div className="space-y-4">
              {mappings.map((mapping) => (
                <MappingCard key={mapping.mapping_id} mapping={mapping} />
              ))}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <LinkIcon className="w-12 h-12 mx-auto text-gray-300" />
              <p className="mt-4 text-gray-500">No Linear issue mappings</p>
              <p className="text-sm text-gray-400">
                Create a delegation rule to automatically link Linear issues to agents
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rules tab */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => refetchRules()}
              disabled={rulesLoading}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <RefreshCw className={clsx('w-4 h-4', rulesLoading && 'animate-spin')} />
              <span>Refresh</span>
            </button>
          </div>

          {rulesLoading && rules.length === 0 ? (
            <div className="card p-8 text-center">
              <RefreshCw className="w-8 h-8 mx-auto text-gray-300 animate-spin" />
              <p className="mt-4 text-gray-500">Loading rules...</p>
            </div>
          ) : rules.length > 0 ? (
            <div className="space-y-4">
              {rules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} />
              ))}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <Zap className="w-12 h-12 mx-auto text-gray-300" />
              <p className="mt-4 text-gray-500">No delegation rules</p>
              <p className="text-sm text-gray-400">
                Create rules to automatically spawn agents from Linear events
              </p>
              <button className="mt-4 btn btn-primary">
                Create Rule
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MappingCard({ mapping }: { mapping: LinearMapping }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
              {mapping.linear_issue_identifier}
            </span>
            <h3 className="text-lg font-medium text-gray-900">
              {mapping.linear_issue_title}
            </h3>
          </div>

          <div className="mt-3 flex items-center space-x-4">
            {/* Linear status */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">Linear:</span>
              <span className="text-sm font-medium text-gray-700">
                {mapping.linear_status || 'Unknown'}
              </span>
            </div>

            {/* Agent status */}
            {mapping.agent_id && (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">Agent:</span>
                <StatusBadge status={mapping.agent_status || 'pending'} size="sm" />
              </div>
            )}

            {/* Sync status */}
            {mapping.status_mismatch && (
              <div className="flex items-center space-x-1 text-yellow-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs">Status mismatch</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
            <span>
              Sync: {mapping.sync_enabled ? 'Enabled' : 'Disabled'}
            </span>
            {mapping.last_synced_at && (
              <span>
                Last synced {formatDistanceToNow(new Date(mapping.last_synced_at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {mapping.linear_issue_url && (
            <a
              href={mapping.linear_issue_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleCard({ rule }: { rule: DelegationRule }) {
  return (
    <div className={clsx(
      'card p-5',
      !rule.enabled && 'opacity-60'
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <Zap className={clsx(
              'w-5 h-5',
              rule.enabled ? 'text-yellow-500' : 'text-gray-400'
            )} />
            <h3 className="text-lg font-medium text-gray-900">
              {rule.name}
            </h3>
            {!rule.enabled && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                Disabled
              </span>
            )}
            {rule.requires_approval && (
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                Requires approval
              </span>
            )}
          </div>

          {rule.description && (
            <p className="mt-2 text-sm text-gray-500">
              {rule.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded">
              {rule.trigger_source}
            </span>
            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
              {rule.trigger_event}
            </span>
            <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
              Role: {rule.agent_role}
            </span>
            <span className="px-2 py-1 bg-gray-50 text-gray-700 rounded">
              Budget: {rule.agent_budget.toLocaleString()} tokens
            </span>
          </div>

          <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
            <span>Priority: {rule.priority}</span>
            <span>Triggered: {rule.trigger_count} times</span>
            {rule.last_triggered_at && (
              <span>
                Last: {formatDistanceToNow(new Date(rule.last_triggered_at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task template preview */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            View task template
          </summary>
          <pre className="mt-2 p-3 bg-gray-50 rounded-lg overflow-auto text-xs whitespace-pre-wrap">
            {rule.agent_task_template}
          </pre>
        </details>
      </div>
    </div>
  );
}
