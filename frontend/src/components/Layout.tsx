import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { User } from '@devportal/shared';
import { useTheme } from '../hooks/useTheme';

interface Props {
  user: User;
  onLogout: () => void;
  children: ReactNode;
}

export default function Layout({ user, onLogout, children }: Props) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navItems = [
    { to: '/', label: 'Projets', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { to: '/monitoring', label: 'Monitoring', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ];
  const adminItems = [
    { to: '/security', label: 'Securite', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { to: '/settings', label: 'Systeme', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ];

  const NavLink = ({ to, label, icon, external }: { to: string; label: string; icon: string; external?: boolean }) => {
    const active = !external && isActive(to);
    const classes = `flex items-center gap-2 px-2 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-accent/15 text-accent border-l-2 border-accent -ml-px'
        : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-3 border-l-2 border-transparent -ml-px'
    }`;
    const iconEl = (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
      </svg>
    );

    if (external) {
      return (
        <a href={to} target="_blank" rel="noopener noreferrer" className={classes} onClick={() => setSidebarOpen(false)}>
          {iconEl}
          {label}
        </a>
      );
    }

    return (
      <Link to={to} className={classes} onClick={() => setSidebarOpen(false)}>
        {iconEl}
        {label}
      </Link>
    );
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-3 py-3 border-b border-border flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
          <img src="/plannet-logo.svg" alt="plan.net" className="w-6 h-6" />
          <div>
            <span className="text-xs font-semibold text-txt-primary">DevPortal</span>
            <span className="text-2xs text-txt-muted ml-1">ops</span>
          </div>
        </Link>
        {/* Close button on mobile */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden text-txt-muted hover:text-txt-primary p-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 space-y-0.5 px-1 overflow-y-auto">
        <div className="px-2 py-1 text-2xs font-medium text-txt-muted uppercase tracking-wider">Navigation</div>
        {navItems.map(item => <NavLink key={item.to} {...item} />)}

        {user.role === 'admin' && (
          <>
            <div className="px-2 py-1 mt-3 text-2xs font-medium text-txt-muted uppercase tracking-wider">Admin</div>
            {adminItems.map(item => <NavLink key={item.to} {...item} />)}
          </>
        )}
      </nav>

      {/* Theme toggle + User */}
      <div className="border-t border-border">
        {/* Theme toggle */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-2xs text-txt-muted">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          <button
            onClick={toggleTheme}
            className="text-txt-muted hover:text-txt-primary transition-colors p-1"
            title={`Passer en mode ${theme === 'dark' ? 'clair' : 'sombre'}`}
          >
            {theme === 'dark' ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>

        {/* User */}
        <div className="px-2 py-2 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-accent/20 text-accent flex items-center justify-center text-2xs font-bold shrink-0">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xs font-medium text-txt-primary truncate">{user.displayName}</p>
              <p className="text-2xs text-txt-muted truncate">{user.role}</p>
            </div>
            <button
              onClick={onLogout}
              className="text-txt-muted hover:text-status-error transition-colors p-0.5"
              title="Deconnexion"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - desktop: always visible, mobile: overlay */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-48 bg-surface-1 border-r border-border flex flex-col shrink-0
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden bg-surface-1 border-b border-border px-3 py-2 flex items-center justify-between shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-txt-secondary hover:text-txt-primary p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/" className="flex items-center gap-1.5">
            <img src="/plannet-logo.svg" alt="plan.net" className="w-5 h-5" />
            <span className="text-xs font-semibold text-txt-primary">DevPortal</span>
          </Link>
          <button
            onClick={toggleTheme}
            className="text-txt-muted hover:text-txt-primary p-1"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </header>

        <main className="flex-1 overflow-auto p-3 lg:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
