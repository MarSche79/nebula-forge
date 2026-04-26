# Nebula Forge Portal — Design System

This document captures the design tokens and component patterns the portal must follow.
Source of truth: the **light theme** of https://icy-desert-044ade203.4.azurestaticapps.net/
Full reference CSS is saved at `styles/reference-styles.css`.

## 🎨 Color Tokens (Light Theme — DEFAULT for portal)

```css
--bg-deep:        #eef4fa;
--bg-mid:         #dfe9f2;
--bg-card:        rgba(255, 255, 255, 0.82);
--bg-glass:       rgba(0, 0, 0, 0.03);
--bg-glass-hover: rgba(0, 0, 0, 0.06);

--primary:        #0e8ab5;
--primary-dark:   #0a6f94;
--primary-glow:   rgba(14, 138, 181, 0.10);
--primary-border: rgba(14, 138, 181, 0.25);

--accent:         #6246d6;
--accent-glow:    rgba(98, 70, 214, 0.10);

--success:        #0ba677;
--warning:        #d08a08;
--danger:         #dc3545;

--text:           #1a2a3a;
--text-muted:     #4a6a82;
--text-dim:       #7a96ad;

--border:         rgba(14, 138, 181, 0.15);
--border-hover:   rgba(14, 138, 181, 0.35);

--radius-sm:      8px;
--radius-md:      14px;
--radius-lg:      20px;

--transition:     all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

--font-main:      'Inter', 'Segoe UI', system-ui, sans-serif;
--font-mono:      'JetBrains Mono', 'Fira Code', monospace;
```

## 🌌 Background nebula gradient (light variant)

```css
.nebula-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 80% 50% at 20% 30%,  rgba(14, 138, 181, 0.08) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 70%,  rgba(98, 70, 214, 0.06)  0%, transparent 60%),
    radial-gradient(ellipse 100% 80% at 50% 100%, rgba(238, 244, 250, 0.7) 0%, transparent 70%);
}
```

Optional starfield canvas with opacity 0.15 in light mode.

## 🧩 Component Patterns

### Navigation
- Fixed top, 68px height
- Backdrop blur: `blur(20px) saturate(1.4)`
- Background (light): `rgba(238, 244, 250, 0.88)`
- Logo + text on left, links + theme toggle + CTA on right

### Buttons
- **Primary**: `--primary` background, `--bg-deep` text, glow shadow
- **Outline**: transparent, `--primary` border + text
- **Ghost**: subtle glass background
- Sizes: default / `.btn-sm` / `.btn-lg`
- Border-radius: `--radius-sm` (8px)

### Cards
- Glassmorphism: `--bg-card` background + `1px solid --border`
- Hover: `--border-hover` + slight lift
- Border-radius: `--radius-md` (14px)

### Section labels
- Pill-shaped badge with `--primary-glow` background
- Uppercase, letter-spaced 0.1em
- Used above section headings

### Headings
- Inter 700–800 weight
- Highlight key words inside `<span>` with `--primary` color
- Examples: `Build the <span>Future</span>` / `Find Your <span>Mission</span>`

### Hero
- Min-height 100vh
- Centered content
- Glowing sphere background element
- Hero stats row at bottom (border-top divider)

### Theme toggle
- Round 38px button with sun/moon SVG
- Persists choice in `localStorage` as `nf-theme`
- **Portal default = light** (the user's specific request)

## 📐 Layout

- `.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }`
- Sections: ~80–100px vertical padding
- Grid breakpoints: standard Tailwind (640 / 768 / 1024 / 1280)

## 🧱 Implementation in Next.js

- Use **Tailwind CSS** with custom theme extending the tokens above
- Inter font via `next/font/google`
- Page transitions: smooth (CSS `--transition`)
- The visual output must match the reference site's **light theme**

## 🔄 Portal-Specific Adaptations

The reference is a **careers** site; our portal is an **employee dashboard**:

| Reference section | Portal equivalent |
|-------------------|-------------------|
| Hero ("Build the Future") | Hero ("Welcome to Nebula Forge — Employee Portal") |
| About Us | About the Station (history, layout, stats) |
| Open Positions | Department Cards (9 departments, click to drill in) |
| Apply CTA | Quick Actions / Chat with Master Agent CTA |
| Footer | Same pattern |

Plus a **persistent chat widget** (bottom-right, expandable to side panel) that talks to the Master Agent backend (Azure AI Foundry Agent Service).

## ✅ Acceptance criteria

When the portal is built, it should:
- Look like the **light version** of the reference site (same color palette, typography, glassmorphism, spacing)
- Be responsive (mobile + tablet + desktop)
- Default to light theme; theme toggle in nav remembers user preference
- Chat widget integrated into the design system (matching button/card styles)
