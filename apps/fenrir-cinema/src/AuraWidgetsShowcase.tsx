import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * AuraWidgetsShowcase — cinematic render of the LORE widget kit
 * (AuraMeter gauge, GlitchStatCard, AuraChargeButton burst).
 * Brand: Void #07030F · Magenta #FF2E6E · Amethyst #9D00FF · Cyan #00E5FF · Amber #FFB020 · Lime #5CF08A
 */

const VOID = "#07030F";
const MAGENTA = "#FF2E6E";
const AMETHYST = "#9D00FF";
const CYAN = "#00E5FF";
const AMBER = "#FFB020";
const LIME = "#5CF08A";
const BURST = [MAGENTA, AMETHYST, CYAN, AMBER, LIME];

const mono = "'JetBrains Mono', ui-monospace, monospace";
const display = "'Anton', 'Space Grotesk', sans-serif";
const body = "'Space Grotesk', system-ui, sans-serif";

const Meter: React.FC<{ progress: number; value: number }> = ({ progress, value }) => {
  const r = 120;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 300, height: 300, display: "grid", placeItems: "center" }}>
      <svg width={300} height={300} viewBox="0 0 300 300">
        <defs>
          <linearGradient id="awg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={MAGENTA} />
            <stop offset="55%" stopColor={AMETHYST} />
            <stop offset="100%" stopColor={CYAN} />
          </linearGradient>
        </defs>
        <circle cx={150} cy={150} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={16} />
        <circle
          cx={150}
          cy={150}
          r={r}
          fill="none"
          stroke="url(#awg)"
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          transform="rotate(-90 150 150)"
          style={{ filter: `drop-shadow(0 0 18px ${AMETHYST})` }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          fontFamily: display,
          fontSize: 64,
          color: "#f4f1ff",
          textShadow: `0 0 30px ${AMETHYST}`
        }}
      >
        {Math.round(value)}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 52,
          fontFamily: mono,
          fontSize: 15,
          letterSpacing: "0.3em",
          color: "rgba(244,241,255,.6)"
        }}
      >
        AURA
      </div>
    </div>
  );
};

const StatCard: React.FC<{ kicker: string; value: string; delta: string; color: string; enter: number }> = ({
  kicker,
  value,
  delta,
  color,
  enter
}) => (
  <div
    style={{
      width: 340,
      padding: "30px 34px 26px",
      borderRadius: 22,
      border: "1px solid rgba(255,255,255,.14)",
      background: "linear-gradient(160deg, rgba(255,255,255,.09), rgba(255,255,255,.02))",
      backdropFilter: "blur(10px)",
      transform: `translateY(${(1 - enter) * 60}px)`,
      opacity: enter,
      boxShadow: `0 0 50px -18px ${color}`
    }}
  >
    <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.26em", color, textTransform: "uppercase" }}>
      {kicker}
    </div>
    <div style={{ fontFamily: display, fontSize: 56, color: "#f4f1ff", marginTop: 6 }}>{value}</div>
    <div style={{ fontFamily: mono, fontSize: 16, color: LIME, marginTop: 8 }}>▲ {delta}</div>
  </div>
);

export const AuraWidgetsShowcase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const meterSpring = spring({ frame: frame - 20, fps, config: { damping: 100, stiffness: 60 } });
  const meterValue = interpolate(meterSpring, [0, 1], [0, 87]);

  const card1 = spring({ frame: frame - 45, fps, config: { damping: 200 } });
  const card2 = spring({ frame: frame - 60, fps, config: { damping: 200 } });

  const burstAt = 110;
  const burstT = interpolate(frame, [burstAt, burstAt + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const likeSquash = spring({ frame: frame - burstAt, fps, config: { damping: 8, stiffness: 200 } });
  const likeCount = frame < burstAt ? 128 : 128 + Math.round(interpolate(burstT, [0, 1], [0, 5]));

  const title = spring({ frame, fps, config: { damping: 200 } });
  const fadeOut = interpolate(frame, [durationInFrames - 24, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp"
  });

  return (
    <AbsoluteFill style={{ backgroundColor: VOID, fontFamily: body, opacity: fadeOut }}>
      {/* aura backdrop */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 80% at 30% 110%, ${AMETHYST}33, transparent 60%),
                       radial-gradient(50% 70% at 85% -10%, ${CYAN}22, transparent 60%),
                       radial-gradient(40% 55% at 70% 100%, ${MAGENTA}22, transparent 65%)`
        }}
      />
      {/* scanlines */}
      <AbsoluteFill
        style={{
          background: "repeating-linear-gradient(to bottom, transparent 0 3px, rgba(255,255,255,.02) 3px 4px)"
        }}
      />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 60, flexDirection: "row" }}>
        <Meter progress={meterSpring * 0.87} value={meterValue} />

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <StatCard kicker="Pack members" value="4,213" delta="12.4% this week" color={CYAN} enter={card1} />
          <StatCard kicker="Aura events" value="98,540" delta="8.1% today" color={MAGENTA} enter={card2} />
        </div>

        {/* charge-like button */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "26px 44px",
            borderRadius: 999,
            border: `1px solid ${frame >= burstAt ? MAGENTA : "rgba(255,255,255,.16)"}`,
            background: "rgba(255,255,255,.06)",
            transform: `scale(${1 + likeSquash * 0.08})`,
            color: "#f4f1ff",
            fontSize: 30
          }}
        >
          <span style={{ color: MAGENTA, filter: `drop-shadow(0 0 12px ${MAGENTA})`, fontSize: 34 }}>♥</span>
          <span style={{ fontFamily: body }}>Like</span>
          <span style={{ fontFamily: mono, fontSize: 26 }}>{likeCount}</span>
          {burstT > 0 &&
            burstT < 1 &&
            Array.from({ length: 18 }, (_, i) => {
              const a = (i / 18) * Math.PI * 2;
              const d = burstT * (90 + (i % 4) * 26);
              return (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: BURST[i % BURST.length],
                    boxShadow: `0 0 14px ${BURST[i % BURST.length]}`,
                    transform: `translate(${Math.cos(a) * d - 5}px, ${Math.sin(a) * d - 5}px) scale(${1 - burstT})`,
                    opacity: 1 - burstT
                  }}
                />
              );
            })}
        </div>
      </AbsoluteFill>

      {/* title */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 70 }}>
        <div
          style={{
            fontFamily: mono,
            fontSize: 18,
            letterSpacing: "0.4em",
            color: "rgba(244,241,255,.55)",
            transform: `translateY(${(1 - title) * 30}px)`,
            opacity: title
          }}
        >
          LORE WIDGET KIT — AURA SERIES
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
