import { useCallback, useRef } from "react";
import { knowledgeBaseUrl } from "../services/knowledgeBase";

const particles = Array.from({ length: 14 }, (_, index) => index + 1);
const titleLetters = ["F", "E", "N", "R", "I", "R"];
const protocolRail = ["IDENTITY", "COMMUNITIES", "TELEGRAM LOCK", "STARS PAYMENTS", "PROTOCOL SERVICES"];

const cinematicStyles = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Orbitron:wght@500;600;700;800&display=swap");

.cinematic-landing {
  --cyan: #00e5ff;
  --violet: #7b2fff;
  --mx: 0;
  --my: 0;
  min-height: 100svh;
  isolation: isolate;
  display: grid;
  place-items: center;
  overflow: hidden;
  position: relative;
  padding: 2rem;
  background: #050505;
  color: #f6fbff;
  font-family: Inter, sans-serif;
}

.cinematic-landing::before,
.cinematic-landing::after {
  content: "";
  position: absolute;
  z-index: -1;
  border-radius: 999px;
  pointer-events: none;
}

.cinematic-landing::before {
  width: min(72vw, 58rem);
  aspect-ratio: 1;
  background: radial-gradient(circle, rgb(0 229 255 / 16%), transparent 67%);
  filter: blur(16px);
  transform: translate(calc(var(--mx) * 2.2rem), calc(var(--my) * 2.2rem));
  animation: cinematic-breathe 8s ease-in-out infinite;
  transition: transform 600ms cubic-bezier(.16, 1, .3, 1);
}

.cinematic-landing::after {
  width: min(46vw, 36rem);
  aspect-ratio: 1;
  background: radial-gradient(circle, rgb(123 47 255 / 18%), transparent 68%);
  filter: blur(18px);
  transform: translate(calc(30% + var(--mx) * -3rem), calc(20% + var(--my) * -3rem));
  animation: cinematic-breathe 10s ease-in-out -3s infinite reverse;
  transition: transform 700ms cubic-bezier(.16, 1, .3, 1);
}

.cinematic-landing__grain {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.28;
  background-image: radial-gradient(rgb(255 255 255 / 10%) 0.55px, transparent 0.55px);
  background-size: 5px 5px;
  mask-image: linear-gradient(to bottom, transparent, #000 28%, #000 72%, transparent);
}

.cinematic-landing__scan {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0, transparent 3px, rgb(255 255 255 / 1.6%) 3px, rgb(255 255 255 / 1.6%) 4px);
}

.cinematic-landing__beam {
  position: absolute;
  inset: -20% -40%;
  z-index: -1;
  pointer-events: none;
  background: conic-gradient(from 210deg at 50% 40%, transparent 0deg, rgb(0 229 255 / 7%) 40deg, transparent 90deg, rgb(123 47 255 / 6%) 200deg, transparent 260deg);
  animation: cinematic-sweep 26s linear infinite;
}

.cinematic-landing__particle {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 999px;
  background: var(--cyan);
  box-shadow: 0 0 12px var(--cyan);
  animation: cinematic-drift 9s ease-in-out infinite;
}

.cinematic-landing__particle:nth-of-type(3n) { background: #b591ff; box-shadow: 0 0 12px #b591ff; }
.cinematic-landing__particle:nth-of-type(1) { left: 8%; top: 74%; animation-delay: -2s; }
.cinematic-landing__particle:nth-of-type(2) { left: 16%; top: 20%; animation-delay: -7s; }
.cinematic-landing__particle:nth-of-type(3) { left: 24%; top: 58%; animation-delay: -4s; }
.cinematic-landing__particle:nth-of-type(4) { left: 34%; top: 12%; animation-delay: -1s; }
.cinematic-landing__particle:nth-of-type(5) { left: 43%; top: 85%; animation-delay: -8s; }
.cinematic-landing__particle:nth-of-type(6) { left: 52%; top: 25%; animation-delay: -3s; }
.cinematic-landing__particle:nth-of-type(7) { left: 61%; top: 70%; animation-delay: -6s; }
.cinematic-landing__particle:nth-of-type(8) { left: 70%; top: 14%; animation-delay: -5s; }
.cinematic-landing__particle:nth-of-type(9) { left: 78%; top: 50%; animation-delay: -2s; }
.cinematic-landing__particle:nth-of-type(10) { left: 87%; top: 27%; animation-delay: -7s; }
.cinematic-landing__particle:nth-of-type(11) { left: 92%; top: 82%; animation-delay: -4s; }
.cinematic-landing__particle:nth-of-type(12) { left: 5%; top: 38%; animation-delay: -6s; }
.cinematic-landing__particle:nth-of-type(13) { left: 30%; top: 92%; animation-delay: -3s; }
.cinematic-landing__particle:nth-of-type(14) { left: 76%; top: 92%; animation-delay: -8s; }

.cinematic-landing__wolf {
  position: absolute;
  z-index: 0;
  right: -2%;
  bottom: -4%;
  width: min(62vw, 700px);
  opacity: .85;
  pointer-events: none;
  transform: translate(calc(var(--mx) * -1.8rem), calc(var(--my) * -1.2rem));
  transition: transform 600ms cubic-bezier(.16, 1, .3, 1);
  filter: drop-shadow(0 0 34px rgb(0 229 255 / 22%)) drop-shadow(0 0 90px rgb(123 47 255 / 18%));
}

.cinematic-landing__wolf svg {
  display: block;
  width: 100%;
  animation: cinematic-wolf-arrive 1.6s cubic-bezier(.16, 1, .3, 1) .35s both;
}

.cinematic-landing__wolf .wolf-eye {
  animation: cinematic-neon 3.2s ease-in-out 2s infinite;
}

@media (max-width: 720px) {
  .cinematic-landing__wolf { width: 88vw; right: -14%; bottom: -3%; opacity: .6; }
}

.cinematic-landing__content {
  position: relative;
  z-index: 1;
  width: min(100%, 60rem);
  text-align: center;
  transform: perspective(900px) rotateX(calc(var(--my) * -1.4deg)) rotateY(calc(var(--mx) * 1.8deg));
  transition: transform 500ms cubic-bezier(.16, 1, .3, 1);
}

.cinematic-landing__eyebrow {
  margin: 0 0 1.5rem;
  color: rgb(218 246 255 / 72%);
  font: 500 clamp(.65rem, 1.3vw, .78rem)/1 Orbitron, sans-serif;
  letter-spacing: .38em;
  text-transform: uppercase;
  animation: cinematic-arrive .9s cubic-bezier(.16, 1, .3, 1) both;
}

.cinematic-landing__title {
  margin: 0;
  color: #effdff;
  font: 800 clamp(4rem, 16vw, 11.5rem)/.78 Orbitron, sans-serif;
  letter-spacing: -.07em;
  text-shadow: 0 0 10px rgb(0 229 255 / 82%), 0 0 42px rgb(0 229 255 / 44%), 0 0 100px rgb(123 47 255 / 35%);
  animation: cinematic-neon 5s ease-in-out 1.4s infinite;
}

.cinematic-landing__title span {
  display: inline-block;
  background: linear-gradient(115deg, #effdff 30%, var(--cyan) 50%, #effdff 62%, #b591ff 78%, #effdff 92%);
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation:
    cinematic-letter .9s cubic-bezier(.16, 1, .3, 1) both,
    cinematic-shimmer 7s ease-in-out 1.6s infinite;
}

.cinematic-landing__title span:nth-child(1) { animation-delay: .08s, 1.6s; }
.cinematic-landing__title span:nth-child(2) { animation-delay: .16s, 1.7s; }
.cinematic-landing__title span:nth-child(3) { animation-delay: .24s, 1.8s; }
.cinematic-landing__title span:nth-child(4) { animation-delay: .32s, 1.9s; }
.cinematic-landing__title span:nth-child(5) { animation-delay: .40s, 2.0s; }
.cinematic-landing__title span:nth-child(6) { animation-delay: .48s, 2.1s; }

.cinematic-landing__line {
  width: min(15rem, 44vw);
  height: 1px;
  margin: clamp(1.6rem, 4vw, 2.6rem) auto 1.35rem;
  background: linear-gradient(90deg, transparent, var(--cyan), var(--violet), transparent);
  box-shadow: 0 0 18px rgb(0 229 255 / 58%);
  animation: cinematic-line 1.1s cubic-bezier(.16, 1, .3, 1) .5s both;
}

.cinematic-landing__tagline {
  max-width: 27rem;
  margin: 0 auto 1.1rem;
  color: rgb(225 239 247 / 72%);
  font-size: clamp(.93rem, 1.8vw, 1.08rem);
  line-height: 1.65;
  animation: cinematic-arrive 1s cubic-bezier(.16, 1, .3, 1) .55s both;
}

.cinematic-landing__pitch {
  max-width: 33rem;
  margin: 0 auto 2rem;
  color: rgb(200 220 232 / 58%);
  font-size: clamp(.8rem, 1.5vw, .92rem);
  line-height: 1.7;
  animation: cinematic-arrive 1s cubic-bezier(.16, 1, .3, 1) .68s both;
}

.cinematic-landing__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: .9rem;
  animation: cinematic-arrive 1s cubic-bezier(.16, 1, .3, 1) .8s both;
}

.cinematic-landing__enter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 11rem;
  min-height: 3.25rem;
  border: 1px solid rgb(0 229 255 / 70%);
  border-radius: 999px;
  padding: .8rem 1.5rem;
  color: #e9fdff;
  background: linear-gradient(100deg, rgb(0 229 255 / 18%), rgb(123 47 255 / 23%));
  box-shadow: inset 0 0 20px rgb(0 229 255 / 8%), 0 0 24px rgb(0 229 255 / 18%);
  font: 600 .75rem/1 Orbitron, sans-serif;
  letter-spacing: .18em;
  text-decoration: none;
  text-transform: uppercase;
  position: relative;
  overflow: hidden;
  transition: transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
}

.cinematic-landing__enter::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgb(255 255 255 / 14%) 50%, transparent 70%);
  background-size: 250% 100%;
  animation: cinematic-shimmer 4.5s ease-in-out 2s infinite;
  pointer-events: none;
}

.cinematic-landing__enter:hover {
  transform: translateY(-2px) scale(1.02);
  background: linear-gradient(100deg, rgb(0 229 255 / 32%), rgb(123 47 255 / 36%));
  box-shadow: inset 0 0 26px rgb(0 229 255 / 14%), 0 0 44px rgb(0 229 255 / 42%);
}

.cinematic-landing__enter:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }

.cinematic-landing__docs {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  min-height: 3.25rem;
  border: 1px solid rgb(181 145 255 / 40%);
  border-radius: 999px;
  padding: .8rem 1.4rem;
  color: rgb(225 239 247 / 82%);
  background: rgb(123 47 255 / 8%);
  font: 600 .7rem/1 Orbitron, sans-serif;
  letter-spacing: .18em;
  text-decoration: none;
  text-transform: uppercase;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, color 180ms ease;
}

.cinematic-landing__docs:hover {
  transform: translateY(-2px);
  border-color: rgb(181 145 255 / 80%);
  color: #f2ecff;
  box-shadow: 0 0 26px rgb(123 47 255 / 30%);
}

.cinematic-landing__docs:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }

.cinematic-landing__docs i {
  font-style: normal;
  transform: translateY(-1px);
}

.cinematic-landing__rail {
  margin-top: 2.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: .55rem 1.5rem;
  color: rgb(218 246 255 / 40%);
  font: 500 .6rem/1 Orbitron, sans-serif;
  letter-spacing: .3em;
  text-transform: uppercase;
  animation: cinematic-arrive 1s cubic-bezier(.16, 1, .3, 1) .95s both;
}

.cinematic-landing__rail span {
  display: inline-flex;
  align-items: center;
  gap: 1.5rem;
}

.cinematic-landing__rail span + span::before {
  content: "◆";
  font-size: .45rem;
  color: rgb(0 229 255 / 45%);
  text-shadow: 0 0 8px rgb(0 229 255 / 60%);
}

@keyframes cinematic-arrive { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes cinematic-wolf-arrive { from { opacity: 0; transform: translateX(46px) scale(.96); filter: blur(10px); } to { opacity: .55; transform: translateX(0) scale(1); filter: blur(0); } }
@keyframes cinematic-letter { from { opacity: 0; transform: translateY(.35em) rotateX(45deg) scale(.9); filter: blur(6px); } to { opacity: 1; transform: translateY(0) rotateX(0) scale(1); filter: blur(0); } }
@keyframes cinematic-line { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
@keyframes cinematic-breathe { 50% { opacity: .62; } }
@keyframes cinematic-neon { 50% { opacity: .88; filter: brightness(1.2); } }
@keyframes cinematic-drift { 50% { opacity: .38; transform: translate3d(0, -28px, 0) scale(1.8); } }
@keyframes cinematic-shimmer { 0% { background-position: 120% 0; } 55% { background-position: -80% 0; } 100% { background-position: -80% 0; } }
@keyframes cinematic-sweep { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .cinematic-landing *, .cinematic-landing::before, .cinematic-landing::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  .cinematic-landing__content { transform: none; }
}
`;

export function CinematicLanding() {
  const rootRef = useRef<HTMLElement | null>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const mx = (event.clientX - rect.left) / rect.width - 0.5;
    const my = (event.clientY - rect.top) / rect.height - 0.5;
    root.style.setProperty("--mx", mx.toFixed(3));
    root.style.setProperty("--my", my.toFixed(3));
  }, []);

  return (
    <main className="cinematic-landing" ref={rootRef} onPointerMove={onPointerMove}>
      <style>{cinematicStyles}</style>
      <div className="cinematic-landing__grain" aria-hidden="true" />
      <div className="cinematic-landing__beam" aria-hidden="true" />
      <div className="cinematic-landing__scan" aria-hidden="true" />
      {particles.map((particle) => <span className="cinematic-landing__particle" key={particle} aria-hidden="true" />)}
      <div className="cinematic-landing__wolf" aria-hidden="true">
        <svg viewBox="0 0 640 520">
          <defs>
            <linearGradient id="cine-wolf-fur" x1="120" y1="80" x2="520" y2="480" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0a1420" />
              <stop offset="0.48" stopColor="#12233c" />
              <stop offset="1" stopColor="#1d3a5e" />
            </linearGradient>
            <linearGradient id="cine-wolf-edge" x1="118" y1="80" x2="530" y2="430" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00e5ff" stopOpacity="0.9" />
              <stop offset="0.55" stopColor="#7b2fff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#00e5ff" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <path
            d="M106 382c51-29 82-58 111-110 18-33 26-68 42-110 7-17 16-41 29-72 13 40 23 70 31 90 32-46 72-79 119-99-9 44-12 77-8 99 42 12 73 31 92 57 18 24 23 53 15 87 24 14 39 30 47 48-29-9-64-10-105-2-44 8-83 28-118 59-50 45-107 59-172 43-42-11-70-41-83-90Z"
            fill="url(#cine-wolf-fur)"
            stroke="url(#cine-wolf-edge)"
            strokeWidth="3.5"
          />
          <path
            d="M320 183c31-45 65-72 102-83-13 37-18 67-13 90 42 8 72 25 88 50-50-10-94 0-132 32-35 29-73 42-114 39 30-21 53-64 69-128Z"
            fill="#04070c"
            opacity="0.85"
          />
          <path d="M443 235l42 8-35 15-28-2 21-21Z" fill="#7ff7ff" className="wolf-eye" />
          <path d="M189 370c41 24 86 33 136 26 47-7 90-26 128-56" stroke="url(#cine-wolf-edge)" strokeWidth="7" strokeLinecap="round" opacity="0.5" />
          <path d="M268 91c15 43 27 77 35 103" stroke="url(#cine-wolf-edge)" strokeWidth="5" strokeLinecap="round" opacity="0.45" />
        </svg>
      </div>
      <section className="cinematic-landing__content" aria-labelledby="cinematic-landing-title">
        <p className="cinematic-landing__eyebrow">MYFENRIR / PRIVATE ACCESS</p>
        <h1 className="cinematic-landing__title" id="cinematic-landing-title">
          {titleLetters.map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}
        </h1>
        <div className="cinematic-landing__line" aria-hidden="true" />
        <p className="cinematic-landing__tagline">The signal is yours. The way in is waiting.</p>
        <p className="cinematic-landing__pitch">
          Fenrir is the front door of the Frisky ecosystem: one identity for your Telegram
          communities, invite rotation, and Stars payments — behind a single gate.
        </p>
        <div className="cinematic-landing__actions">
          <a className="cinematic-landing__enter" href="/login">Enter</a>
          <a className="cinematic-landing__docs" href={knowledgeBaseUrl} target="_blank" rel="noreferrer">
            Wiki <i>↗</i>
          </a>
        </div>
        <div className="cinematic-landing__rail" aria-hidden="true">
          {protocolRail.map((lane) => <span key={lane}>{lane}</span>)}
        </div>
      </section>
    </main>
  );
}
