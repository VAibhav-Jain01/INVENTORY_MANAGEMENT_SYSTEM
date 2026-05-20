import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Package,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Package, label: 'Products', path: '/products' },
  { icon: FileText, label: 'Bills', path: '/bills' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { profile, signOut } = useAuth();
  const location = useLocation();

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Overlay for mobile */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen z-50 transition-all duration-300 ease-in-out',
          'bg-sidebar border-r border-sidebar-border',
          'lg:relative lg:translate-x-0',
          collapsed ? '-translate-x-full lg:w-20' : 'translate-x-0 w-64'
        )}
        style={{ background: 'var(--gradient-sidebar)' }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={cn(
            'flex items-center gap-3 p-6 border-b border-sidebar-border',
            collapsed && 'lg:justify-center lg:px-4'
          )}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center text-accent-foreground font-bold shadow-glow">
              SF
            </div>
            {!collapsed && (
              <div className="animate-fade-in">
                <h1 className="font-bold text-sidebar-foreground">StockFlow</h1>
                <p className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">
                  {profile?.company_name || 'Your Business'}
                </p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'sidebar-link',
                    isActive && 'sidebar-link-active',
                    collapsed && 'lg:justify-center lg:px-3'
                  )}
                  onClick={() => window.innerWidth < 1024 && setCollapsed(true)}
                >
                  <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-sidebar-primary')} />
                  {!collapsed && <span className="animate-fade-in">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-sidebar-border space-y-2">
            <button
              onClick={signOut}
              className={cn(
                'sidebar-link w-full text-sidebar-foreground/60 hover:text-destructive',
                collapsed && 'lg:justify-center lg:px-3'
              )}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </button>

            {/* Collapse button - desktop only */}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'hidden lg:flex w-full text-sidebar-foreground/60 hover:text-sidebar-foreground',
                collapsed && 'justify-center'
              )}
              onClick={() => setCollapsed(!collapsed)}
            >
              <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
              {!collapsed && <span className="ml-2">Collapse</span>}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
