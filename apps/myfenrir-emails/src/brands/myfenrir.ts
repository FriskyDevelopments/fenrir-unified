import type { Brand } from "./types";

// MyFenrir — authoritative tokens reconciled from the LIVE identity:
//   • the transactional email already shipping in fenrir-bridge
//     (canvas #050505 / panel #0B0E1A, cyan #4FD7E0, amethyst #8B7CFF, THE PACK)
//   • the landing design system (canonical cyan #00E5FF, amethyst #9D00FF,
//     void #07030F) and the dashboard gold (#F1B75C / #C2A469).
// Cyan #00E5FF is the primary accent; amethyst #8B7CFF the secondary; gold the
// premium/dashboard tertiary. NO neon-lime (landing has one; excluded on purpose).
//
// Cloudflare Email Sending is onboarded for mail.myfenrir.com. The visible
// sender therefore uses that authenticated subdomain; replies still go to the
// root-domain support address.
export const myfenrir: Brand = {
  id: "myfenrir",
  name: "MyFenrir",
  wordmark: "FENRIR",
  wordmarkDot: true,
  tagline: "THE PACK",
  logoUrl: "https://www.myfenrir.com/fenrir-splash-icon-512.png",
  logoWidth: 84,
  colors: {
    ink: "#05060B",
    inkAlt: "#0B0E1A",
    surface: "#0B0E1A",
    surfaceAlt: "#121734",
    border: "rgba(150,166,224,0.16)",
    heading: "#ECEEFF",
    body: "#CFD3E8",
    muted: "#AEB5D0",
    faint: "#858BA8",
    accent: "#00E5FF",
    accentSoft: "#4FD7E0",
    accentDark: "#00A7C4",
    onAccent: "#04121A",
    purple: "#8B7CFF",
    gold: "#F1B75C",
    danger: "#FF425F",
  },
  sender: {
    name: "MyFenrir",
    email: "noreply@mail.myfenrir.com",
    replyTo: "hola@myfenrir.com",
  },
  footer: {
    legal: "Fenrir Protocol · MyFenrir — La manada digital",
    note: "Si tú no solicitaste este correo puedes ignorarlo con seguridad; nadie podrá acceder a tu cuenta sin este mensaje. Nunca te pediremos tu contraseña por correo.",
    links: [
      { label: "Abrir MyFenrir", url: "https://www.myfenrir.com/main" },
      { label: "Fenrir Wiki", url: "https://myfenrir.com/wiki" },
    ],
    signoff: "Enviado por MyFenrir · myfenrir.com",
  },
  site: "https://www.myfenrir.com",
  supportEmail: "hola@myfenrir.com",
};
