import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nebula Forge — Beyond the Frontier',
  description:
    'Nebula Forge — a deep-space research and mining station operated by humans and AI agents. Sign in as crew to access the Command Center.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('nf-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <div className="nebula-bg" aria-hidden />
        <div className="starfield" aria-hidden />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
