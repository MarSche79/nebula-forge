import { Sparkles, Briefcase } from 'lucide-react';
import MarketingNav from '@/components/MarketingNav';
import Footer from '@/components/Footer';
import JobsBrowser from '@/components/JobsBrowser';
import { JOBS, DEPARTMENTS } from '@/lib/jobs';

export const metadata = {
  title: 'Careers · Nebula Forge',
  description:
    'Join Nebula Forge — open positions across Engineering, Cybersecurity, Marketing, Sales, and IT.',
};

export default function CareersPage() {
  return (
    <>
      <MarketingNav />
      <main>
        {/* Hero */}
        <section className="relative pt-24 pb-12 overflow-hidden">
          <div
            aria-hidden
            className="absolute -z-10 rounded-full blur-3xl opacity-40"
            style={{
              width: 520,
              height: 520,
              right: '-120px',
              top: '0%',
              background:
                'radial-gradient(circle, rgba(98,70,214,0.25) 0%, rgba(14,138,181,0.15) 40%, transparent 70%)',
            }}
          />
          <div className="container-nf relative z-10">
            <span className="section-label mb-6">
              <Sparkles size={12} /> We&apos;re hiring
            </span>
            <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight max-w-3xl">
              Build a station that <span className="text-highlight">outlives us all.</span>
            </h1>
            <p className="mt-5 text-lg text-muted max-w-2xl">
              Nebula Forge is hiring across the deck. Engineering, science,
              cybersecurity, sales, IT — if you want to work on systems that
              run unattended for decades and keep humans alive doing it, we&apos;d
              love to hear from you.
            </p>

            <div
              className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 max-w-3xl"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <Stat label="Open roles" value={String(JOBS.length)} />
              <Stat label="Departments" value={String(DEPARTMENTS.length)} />
              <Stat label="Locations" value="6" />
              <Stat label="Remote-friendly" value="Yes" />
            </div>
          </div>
        </section>

        {/* Listings */}
        <section className="pb-24 pt-8">
          <div className="container-nf">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
                <Briefcase size={22} style={{ color: 'var(--primary)' }} />
                Open positions
              </h2>
              <span className="text-sm text-dim">
                {JOBS.length} role{JOBS.length === 1 ? '' : 's'} across {DEPARTMENTS.length} departments
              </span>
            </div>
            <JobsBrowser />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-extrabold" style={{ color: 'var(--primary)' }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-widest text-dim">{label}</div>
    </div>
  );
}
