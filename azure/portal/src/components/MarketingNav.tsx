'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, LogIn } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const links = [
  { href: '/#mission',   label: 'Mission' },
  { href: '/#systems',   label: 'Systems' },
  { href: '/#fleet',     label: 'Fleet' },
  { href: '/careers',    label: 'Careers' },
];

export default function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 w-full"
      style={{
        background: 'rgba(238, 244, 250, 0.88)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="container-nf flex items-center justify-between" style={{ height: 68 }}>
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-widest text-sm">
          <span
            className="inline-block w-7 h-7 rounded-md"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
          />
          <span style={{ color: 'var(--primary)' }}>NEBULA FORGE</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted hover:text-[color:var(--primary)] transition"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <a href="/.auth/login/aad?post_login_redirect_uri=/command-center" className="btn-primary btn-sm">
            <LogIn size={14} /> Crew Sign-In
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
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-muted py-1"
              >
                {l.label}
              </a>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <ThemeToggle />
              <a
                href="/.auth/login/aad?post_login_redirect_uri=/command-center"
                className="btn-primary btn-sm"
              >
                <LogIn size={14} /> Crew Sign-In
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
