const particles = Array.from({ length: 14 }, (_, index) => index + 1);

const cinematicStyles = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Orbitron:wght@500;600;700;800&display=swap");

.cinematic-landing {
  --cyan: #00e5ff;
  --violet: #7b2fff;
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
  animation: cinematic-breathe 8s ease-in-out infinite;
}

.cinematic-landing::after {
  width: min(46vw, 36rem);
  aspect-ratio: 1;
  background: radial-gradient(circle, rgb(123 47 255 / 18%), transparent 68%);
  filter: blur(18px);
  transform: translate(30%, 20%);
  animation: cinematic-breathe 10s ease-in-out -3s infinite reverse;
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

.cinematic-landing__content {
  width: min(100%, 60rem);
  text-align: center;
  animation: cinematic-arrive 1.1s cubic-bezier(.16, 1, .3, 1) both;
}

.cinematic-landing__eyebrow {
  margin: 0 0 1.5rem;
  color: rgb(218 246 255 / 72%);
  font: 500 clamp(.65rem, 1.3vw, .78rem)/1 Orbitron, sans-serif;
  letter-spacing: .38em;
  text-transform: uppercase;
}

.cinematic-landing__title {
  margin: 0;
  color: #effdff;
  font: 800 clamp(4rem, 16vw, 11.5rem)/.78 Orbitron, sans-serif;
  letter-spacing: -.07em;
  text-shadow: 0 0 10px rgb(0 229 255 / 82%), 0 0 42px rgb(0 229 255 / 44%), 0 0 100px rgb(123 47 255 / 35%);
  animation: cinematic-neon 5s ease-in-out 1.1s infinite;
}

.cinematic-landing__line {
  width: min(15rem, 44vw);
  height: 1px;
  margin: clamp(2rem, 5vw, 3.5rem) auto 1.5rem;
  background: linear-gradient(90deg, transparent, var(--cyan), var(--violet), transparent);
  box-shadow: 0 0 18px rgb(0 229 255 / 58%);
}

.cinematic-landing__tagline {
  max-width: 27rem;
  margin: 0 auto 2.25rem;
  color: rgb(225 239 247 / 72%);
  font-size: clamp(.93rem, 1.8vw, 1.08rem);
  line-height: 1.65;
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
  transition: transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
}

.cinematic-landing__enter:hover {
  transform: translateY(-2px);
  background: linear-gradient(100deg, rgb(0 229 255 / 32%), rgb(123 47 255 / 36%));
  box-shadow: inset 0 0 26px rgb(0 229 255 / 14%), 0 0 34px rgb(0 229 255 / 34%);
}

.cinematic-landing__enter:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }

@keyframes cinematic-arrive { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes cinematic-breathe { 50% { opacity: .62; transform: scale(1.13); } }
@keyframes cinematic-neon { 50% { opacity: .88; filter: brightness(1.2); } }
@keyframes cinematic-drift { 50% { opacity: .38; transform: translate3d(0, -28px, 0) scale(1.8); } }

@media (prefers-reduced-motion: reduce) {
  .cinematic-landing *, .cinematic-landing::before, .cinematic-landing::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;

export function CinematicLanding() {
  return (
    <main className="cinematic-landing">
      <style>{cinematicStyles}</style>
      <div className="cinematic-landing__grain" aria-hidden="true" />
      {particles.map((particle) => <span className="cinematic-landing__particle" key={particle} aria-hidden="true" />)}
      <section className="cinematic-landing__content" aria-labelledby="cinematic-landing-title">
        <p className="cinematic-landing__eyebrow">MYFENRIR / PRIVATE ACCESS</p>
        <h1 className="cinematic-landing__title" id="cinematic-landing-title">FENRIR</h1>
        <div className="cinematic-landing__line" aria-hidden="true" />
        <p className="cinematic-landing__tagline">The signal is yours. The way in is waiting.</p>
        <a className="cinematic-landing__enter" href="/login">Enter</a>
      </section>
    </main>
  );
}
