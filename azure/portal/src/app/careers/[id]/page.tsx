import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  CalendarDays,
  Building2,
  GraduationCap,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import MarketingNav from '@/components/MarketingNav';
import Footer from '@/components/Footer';
import ApplyButton from '@/components/ApplyButton';
import { JOBS, deptColor, formatPostedDate, findJob } from '@/lib/jobs';

interface Params {
  id: string;
}

export function generateStaticParams(): Params[] {
  return JOBS.map((j) => ({ id: j.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const job = findJob(id);
  if (!job) return { title: 'Role not found · Nebula Forge' };
  return {
    title: `${job.title} · Nebula Forge Careers`,
    description: job.description,
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const job = findJob(id);
  if (!job) notFound();

  const c = deptColor(job.department);

  return (
    <>
      <MarketingNav />
      <main>
        <section className="relative pt-16 pb-10 overflow-hidden">
          <div
            aria-hidden
            className="absolute -z-10 rounded-full blur-3xl opacity-40"
            style={{
              width: 480,
              height: 480,
              right: '-100px',
              top: '0%',
              background: `radial-gradient(circle, ${c}40 0%, transparent 70%)`,
            }}
          />
          <div className="container-nf relative z-10">
            <Link
              href="/careers"
              className="inline-flex items-center gap-1 text-sm font-medium mb-6 transition hover:gap-2"
              style={{ color: 'var(--primary)' }}
            >
              <ArrowLeft size={14} /> All open positions
            </Link>

            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                style={{
                  background: `${c}1a`,
                  color: c,
                  border: `1px solid ${c}55`,
                }}
              >
                {job.department}
              </span>
              <span className="pill" style={{ fontSize: 10 }}>
                {job.level}
              </span>
              <span className="pill" style={{ fontSize: 10 }}>
                {job.type}
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              {job.title}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              <Meta icon={MapPin} text={job.location} />
              <Meta icon={Briefcase} text={job.salary} />
              <Meta icon={CalendarDays} text={`Posted ${formatPostedDate(job.posted)}`} />
              <Meta icon={Building2} text={`Role ID: ${job.id}`} />
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="container-nf grid lg:grid-cols-[1fr_320px] gap-8">
            {/* Main content */}
            <article
              className="p-8 md:p-10"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                backdropFilter: 'blur(14px) saturate(1.2)',
              }}
            >
              <Section title="About the role" icon={Sparkles} accent={c}>
                <p className="text-[15px] leading-relaxed text-muted whitespace-pre-line">
                  {job.description}
                </p>
              </Section>

              <Section title="Responsibilities" icon={CheckCircle2} accent={c}>
                <ul className="space-y-2.5">
                  {job.responsibilities.map((r, idx) => (
                    <BulletItem key={idx} text={r} accent={c} />
                  ))}
                </ul>
              </Section>

              <Section title="What you'll bring" icon={GraduationCap} accent={c}>
                <ul className="space-y-2.5">
                  {job.requirements.map((r, idx) => (
                    <BulletItem key={idx} text={r} accent={c} />
                  ))}
                </ul>
              </Section>

              <Section title="Benefits" icon={Sparkles} accent={c}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {job.benefits.map((b, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 text-[13px]"
                      style={{
                        background: 'var(--bg-glass)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text)',
                      }}
                    >
                      ✦ {b}
                    </div>
                  ))}
                </div>
              </Section>
            </article>

            {/* Aside / apply card */}
            <aside className="space-y-5">
              <div
                className="p-6 sticky"
                style={{
                  top: 88,
                  background: `linear-gradient(135deg, ${c}14, var(--bg-card))`,
                  border: `1px solid ${c}55`,
                  borderRadius: 'var(--radius-md)',
                  backdropFilter: 'blur(14px) saturate(1.2)',
                }}
              >
                <div className="text-xs uppercase tracking-widest text-dim mb-2">
                  Apply for this role
                </div>
                <h3 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
                  Ready to come aboard?
                </h3>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">
                  Send us your CV and a short note. The hiring team for{' '}
                  <span className="font-semibold" style={{ color: c }}>
                    {job.department}
                  </span>{' '}
                  reviews every application personally.
                </p>
                <ApplyButton jobId={job.id} jobTitle={job.title} department={job.department} accent={c} />
              </div>

              <RelatedRoles currentId={job.id} />
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Meta({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number }>; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} /> {text}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  accent,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 last:mb-0">
      <h2
        className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest mb-4"
        style={{ color: accent }}
      >
        <Icon size={14} /> {title}
      </h2>
      {children}
    </section>
  );
}

function BulletItem({ text, accent }: { text: string; accent: string }) {
  return (
    <li className="flex gap-2.5 text-[14px] leading-relaxed" style={{ color: 'var(--text)' }}>
      <span
        className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: accent }}
      />
      <span>{text}</span>
    </li>
  );
}

function RelatedRoles({ currentId }: { currentId: string }) {
  const current = findJob(currentId);
  if (!current) return null;
  const related = JOBS
    .filter((j) => j.id !== currentId && j.department === current.department)
    .slice(0, 3);
  if (related.length === 0) return null;

  return (
    <div
      className="p-5"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="text-xs uppercase tracking-widest text-dim mb-3">
        More in {current.department}
      </div>
      <div className="space-y-2">
        {related.map((j) => (
          <Link
            key={j.id}
            href={`/careers/${j.id}`}
            className="block p-3 transition"
            style={{
              background: 'var(--bg-glass)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
            }}
          >
            <div className="text-sm font-semibold truncate">{j.title}</div>
            <div className="text-[11px] text-dim mt-0.5 truncate">
              {j.location} · {j.level}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
