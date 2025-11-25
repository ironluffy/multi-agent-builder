import { clsx } from 'clsx';
import type { AgentStatus, ControlState, ApprovalStatus, WorkflowStatus } from '../types';

interface StatusBadgeProps {
  status: AgentStatus | ControlState | ApprovalStatus | WorkflowStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  // Agent statuses
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
  executing: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Executing' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },

  // Control states
  running: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Running' },
  paused: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Paused' },
  terminating: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Terminating' },
  terminated: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Terminated' },

  // Approval statuses
  approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
  expired: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Expired' },
  auto_approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Auto-approved' },

  // Workflow statuses
  draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
  active: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Active' },
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };

  return (
    <span className={clsx(
      'inline-flex items-center rounded-full font-medium',
      config.bg,
      config.text,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-sm'
    )}>
      {config.label}
    </span>
  );
}
