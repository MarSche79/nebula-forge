'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LayoutDashboard, MessageSquare, LogOut, Menu, X, UserCircle2, Globe2, Briefcase, KanbanSquare } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import Logo from './Logo';

interface AppNavProps {
  displayName?: string;
}

const links = [
  { href: '/command-center', label: 'Command Center', icon: MessageSquare },
  { href: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/agents-board',   label: 'Agents Board',   icon: KanbanSquare },
  { href: '/hr',             label: 'HR Portal',      icon: Briefcase },
];

export default function AppNav({ displayName }: AppNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const initials = (displayName ?? 'CR')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <header
      className="sticky top-0 z-40 w-full"
      style={{
        background: 'rgba(238, 244, 250, 0.92)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="container-nf flex items-center justify-between" style={{ height: 68 }}>
        <Link href="/command-center" className="flex items-center gap-2.5 font-extrabold tracking-widest text-sm">
          <Logo size={32} />
          <span style={{ color: 'var(--primary)' }}>NEBULA FORGE</span>
          <span className="hidden sm:inline ml-2 pill" style={{ fontSize: '0.65rem' }}>
            CREW · ACTIVE
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => {
            const Icon = l.icon;
            const active = pathname === l.href || pathname?.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="px-4 py-2 rounded-nf-sm text-sm font-medium transition"
                style={{
                  background: active ? 'var(--primary-glow)' : 'transparent',
                  color: active ? 'var(--primary-dark)' : 'var(--text-muted)',
                  border: `1px solid ${active ? 'var(--primary-border)' : 'transparent'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <Icon size={14} /> {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="btn-ghost btn-sm" title="Public site">
            <Globe2 size={14} />
          </Link>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-nf-sm"
            style={{
              background: 'var(--bg-glass)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                color: '#fff',
              }}
            >
              {initials || <UserCircle2 size={14} />}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {displayName ?? 'Crew'}
            </span>
          </div>
          <a href="/.auth/logout?post_logout_redirect_uri=/" className="btn-ghost btn-sm" title="Sign out">
            <LogOut size={14} />
          </a>
        </div>

        <button
          className="md:hidden btn-ghost btn-sm"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          type="button"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="container-nf py-4 flex flex-col gap-3">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="text-sm font-medium py-2 flex items-center gap-2"
                >
                  <Icon size={14} /> {l.label}
                </Link>
              );
            })}
            <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <ThemeToggle />
              <span className="pill"><UserCircle2 size={12} /> {displayName ?? 'Crew'}</span>
              <a href="/.auth/logout?post_logout_redirect_uri=/" className="btn-ghost btn-sm">
                <LogOut size={14} /> Sign out
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
