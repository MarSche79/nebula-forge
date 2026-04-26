import Logo from './Logo';

export default function Footer() {
  return (
    <footer
      className="mt-24 py-10"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <div className="container-nf flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-widest">
          <Logo size={22} staticMark />
          <span style={{ color: 'var(--primary)' }}>NEBULA FORGE</span>
          <span className="text-dim">· Employee Portal</span>
        </div>
        <div className="text-xs text-dim">
          © {new Date().getFullYear()} Nebula Forge Station. All systems nominal.
        </div>
      </div>
    </footer>
  );
}
