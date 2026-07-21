import type { Config } from "tailwindcss";

/**
 * Design system Miya Belkora Design.
 * Palette dérivée du logo : vert lime (marguerite / "DESIGN"), verts sauge (pétales),
 * gris neutres (texte "Miya Belkora"). Couleurs exposées en variables HSL (voir index.css)
 * pour un thème clair/sombre cohérent.
 */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
        },
        sage: {
          DEFAULT: "hsl(var(--sage))",
          foreground: "hsl(var(--sage-foreground))",
        },
        gold: "hsl(var(--gold))",
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        display: ['"Libre Baskerville"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        /* Élévation nette et discrète — pas de « ghost-card » (bordure + ombre large). */
        card: "0 1px 2px hsl(var(--foreground) / 0.05)",
        elevated: "0 4px 12px hsl(var(--foreground) / 0.08), 0 1px 3px hsl(var(--foreground) / 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
