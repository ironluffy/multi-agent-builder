import { ReactNode } from 'react';
import { clsx } from 'clsx';

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

const colorConfig = {
  blue: {
    bg: 'bg-blue-50',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-600',
    trendUp: 'text-blue-600',
  },
  green: {
    bg: 'bg-green-50',
    iconBg: 'bg-green-100',
    iconText: 'text-green-600',
    trendUp: 'text-green-600',
  },
  yellow: {
    bg: 'bg-yellow-50',
    iconBg: 'bg-yellow-100',
    iconText: 'text-yellow-600',
    trendUp: 'text-yellow-600',
  },
  red: {
    bg: 'bg-red-50',
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
    trendUp: 'text-red-600',
  },
  purple: {
    bg: 'bg-purple-50',
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-600',
    trendUp: 'text-purple-600',
  },
};

export default function MetricCard({
  title,
  value,
  icon,
  trend,
  color = 'blue',
}: MetricCardProps) {
  const colors = colorConfig[color];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
          {trend && (
            <p className={clsx('mt-1 text-sm', colors.trendUp)}>
              {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className={clsx('p-3 rounded-lg', colors.iconBg)}>
          <div className={colors.iconText}>{icon}</div>
        </div>
      </div>
    </div>
  );
}
