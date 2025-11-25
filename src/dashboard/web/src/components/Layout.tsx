import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Bot,
  GitBranch,
  CheckCircle,
  Link as LinkIcon,
  Bell,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useSocketStore } from '../stores/socketStore';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Agents', href: '/agents', icon: Bot },
  { name: 'Workflows', href: '/workflows', icon: GitBranch },
  { name: 'Approvals', href: '/approvals', icon: CheckCircle },
  { name: 'Linear', href: '/linear', icon: LinkIcon },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { connected, notifications } = useSocketStore();
  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Bot className="w-8 h-8 text-primary-600" />
              <h1 className="text-xl font-bold text-gray-900">
                Multi-Agent Dashboard
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* Connection status */}
              <div className={clsx(
                'flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm',
                connected
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              )}>
                {connected ? (
                  <>
                    <Wifi className="w-4 h-4" />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4" />
                    <span>Disconnected</span>
                  </>
                )}
              </div>

              {/* Notifications */}
              <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)] sticky top-16">
          <nav className="p-4 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon className={clsx(
                    'w-5 h-5',
                    isActive ? 'text-primary-600' : 'text-gray-400'
                  )} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
