import { Quote } from 'lucide-react';

/**
 * "From the CEO" section — Nova Keller's portrait + mission quote.
 * Server component: pure layout, no client-side state.
 */
export default function CeoStatement() {
  return (
    <section id="ceo" className="py-24 relative">
      <div className="container-nf">
        <div
          className="grid lg:grid-cols-[300px_1fr] gap-10 items-center p-8 md:p-12"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            backdropFilter: 'blur(14px) saturate(1.2)',
            boxShadow: '0 20px 60px rgba(14, 138, 181, 0.08)',
          }}
        >
          {/* Portrait */}
          <div className="mx-auto lg:mx-0 relative" style={{ width: 240 }}>
            <div
              aria-hidden
              className="absolute -inset-3 rounded-full blur-2xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(14,138,181,0.30) 0%, rgba(98,70,214,0.18) 50%, transparent 70%)',
              }}
            />
            <div
              className="relative rounded-full overflow-hidden"
              style={{
                width: 240,
                height: 240,
                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                padding: 3,
                boxShadow: '0 18px 40px rgba(14, 138, 181, 0.30)',
              }}
            >
              <div
                className="rounded-full overflow-hidden w-full h-full"
                style={{ background: 'var(--bg-deep)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/team/nova-keller.png"
                  alt="Nova Keller, CEO of Nebula Forge"
                  width={240}
                  height={240}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center top',
                    display: 'block',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Statement */}
          <div>
            <span className="section-label mb-4">From the CEO</span>
            <Quote
              size={42}
              className="mb-3"
              style={{ color: 'var(--primary)', opacity: 0.45 }}
              aria-hidden
            />
            <p
              className="text-lg md:text-xl leading-relaxed"
              style={{ color: 'var(--text)' }}
            >
              We didn&apos;t come this far to play it safe. Nebula Forge exists
              because the next chapter of our species belongs out here — and the
              only way to write it is with crews who do the hard work, agents
              that never sleep, and a discipline of <span className="text-highlight">building things that last decades</span>,
              not quarters. Every shift on this station moves humanity one
              orbit further from where we started.
            </p>
            <div className="mt-6 flex items-baseline gap-3">
              <div>
                <div className="text-base font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
                  Nova Keller
                </div>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
                  Chief Executive Officer · Nebula Forge
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
