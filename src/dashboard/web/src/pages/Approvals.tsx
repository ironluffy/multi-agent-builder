import { useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import { useApprovals } from '../hooks/useApi';
import { useSocketStore } from '../stores/socketStore';
import type { ApprovalRequest, ApprovalStatus } from '../types';

export default function Approvals() {
  const { data, loading, refetch } = useApprovals(3000);
  const { approveRequest, rejectRequest } = useSocketStore();
  const [filter, setFilter] = useState<ApprovalStatus | 'all'>('pending');
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const approvals = data?.approvals || [];

  const filteredApprovals = filter === 'all'
    ? approvals
    : approvals.filter(a => a.status === filter);

  const statusCounts = approvals.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleApprove = async (approval: ApprovalRequest) => {
    setActionLoading(approval.id);
    try {
      await approveRequest(approval.id);
      refetch();
    } catch (error) {
      console.error('Failed to approve:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (approval: ApprovalRequest) => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    setActionLoading(approval.id);
    try {
      await rejectRequest(approval.id, rejectReason);
      setRejectReason('');
      setSelectedApproval(null);
      refetch();
    } catch (error) {
      console.error('Failed to reject:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-100 text-red-800 border-red-200';
    if (priority >= 5) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and approve agent actions requiring human oversight
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
      <div className="flex items-center space-x-2">
        {(['all', 'pending', 'approved', 'rejected', 'expired'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={clsx(
              'px-4 py-2 text-sm rounded-lg transition-colors',
              filter === status
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {status !== 'all' && statusCounts[status] !== undefined && (
              <span className="ml-1.5 text-xs opacity-60">
                ({statusCounts[status] || 0})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Approvals list */}
      {loading && approvals.length === 0 ? (
        <div className="card p-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto text-gray-300 animate-spin" />
          <p className="mt-4 text-gray-500">Loading approvals...</p>
        </div>
      ) : filteredApprovals.length > 0 ? (
        <div className="space-y-4">
          {filteredApprovals.map((approval) => (
            <div
              key={approval.id}
              className={clsx(
                'card p-5',
                approval.status === 'pending' && approval.priority >= 8 && 'ring-2 ring-red-200'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-medium text-gray-900">
                      {approval.title}
                    </h3>
                    <StatusBadge status={approval.status} />
                    <span className={clsx(
                      'px-2 py-0.5 text-xs font-medium rounded border',
                      getPriorityColor(approval.priority)
                    )}>
                      P{approval.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {approval.description}
                  </p>
                  <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
                      </span>
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded">
                      {approval.request_type}
                    </span>
                    {approval.expires_at && (
                      <span className="flex items-center space-x-1 text-yellow-600">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>
                          Expires {formatDistanceToNow(new Date(approval.expires_at), { addSuffix: true })}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {approval.status === 'pending' && (
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleApprove(approval)}
                      disabled={actionLoading === approval.id}
                      className="btn btn-success flex items-center space-x-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => setSelectedApproval(approval)}
                      disabled={actionLoading === approval.id}
                      className="btn btn-danger flex items-center space-x-1"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Request data preview */}
              {approval.request_data && Object.keys(approval.request_data).length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                      View request details
                    </summary>
                    <pre className="mt-2 p-3 bg-gray-50 rounded-lg overflow-auto text-xs">
                      {JSON.stringify(approval.request_data, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {/* Show rejection reason if rejected */}
              {approval.status === 'rejected' && approval.rejection_reason && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-red-600">
                    <strong>Rejection reason:</strong> {approval.rejection_reason}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto text-gray-300" />
          <p className="mt-4 text-gray-500">
            {filter === 'pending'
              ? 'No pending approvals'
              : 'No approvals match your filter'}
          </p>
        </div>
      )}

      {/* Rejection modal */}
      {selectedApproval && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Reject Approval
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Please provide a reason for rejecting "{selectedApproval.title}"
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="mt-4 w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={4}
            />
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setSelectedApproval(null);
                  setRejectReason('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(selectedApproval)}
                disabled={actionLoading === selectedApproval.id || !rejectReason.trim()}
                className="btn btn-danger"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
