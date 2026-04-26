export default function Footer() {
  return (
    <footer
      className="mt-24 py-10"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <div className="container-nf flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-widest">
          <span
            className="inline-block w-5 h-5 rounded-md"
            style={{
              background:
                'linear-gradient(135deg, var(--primary), var(--accent))',
            }}
          />
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
