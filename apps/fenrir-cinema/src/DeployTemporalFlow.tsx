import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const colors = {
  bg: "#030607",
  panel: "rgba(8, 15, 18, 0.88)",
  panel2: "rgba(13, 23, 28, 0.9)",
  line: "rgba(190, 211, 220, 0.28)",
  text: "#f8fff4",
  muted: "#a8b7b4",
  fenrir: "#b8ff46",
  temporal: "#7c5cff",
  cloud: "#4bb3ff",
  neon: "#37f6ff",
  warn: "#ffd166",
  red: "#ff4d6d",
  green: "#8dff75",
};

const steps = [
  {
    label: "Trigger",
    title: "Release candidate",
    body: "Fenrir operator proposes a Cloud Run revision for launch review.",
    lane: "workflow",
  },
  {
    label: "Activity",
    title: "Preflight checks",
    body: "Typecheck, build, env shape, and safe public VITE_* inputs must pass.",
    lane: "activity",
  },
  {
    label: "Activity",
    title: "Staging revision",
    body: "Cloud Build creates the image and Cloud Run exposes a candidate URL.",
    lane: "gcloud",
  },
  {
    label: "Activity",
    title: "Probe solution",
    body: "Fenrir verifies app shell, auth routing, Supabase base, and route safety.",
    lane: "gcloud",
  },
  {
    label: "Activity",
    title: "Go criteria",
    body: "A launch only passes when every required signal is green.",
    lane: "verify",
  },
  {
    label: "Decision",
    title: "GO / NO-GO",
    body: "Go promotes traffic. No-Go freezes release, rolls back, and notifies owner.",
    lane: "decision",
  },
] as const;

const timeline = [34, 86, 138, 194, 254, 318];

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const clamp = (frame: number, input: [number, number], output: [number, number]) =>
  interpolate(frame, input, output, {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const laneColor = (lane: (typeof steps)[number]["lane"]) => {
  if (lane === "workflow") return colors.temporal;
  if (lane === "activity") return colors.fenrir;
  if (lane === "gcloud") return colors.cloud;
  if (lane === "verify") return colors.neon;
  return colors.warn;
};

function Background() {
  const frame = useCurrentFrame();
  const scan = interpolate(frame % 120, [0, 120], [-220, 2140], {
    easing: Easing.linear,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 14% 16%, rgba(184,255,70,0.18), transparent 28%), radial-gradient(circle at 80% 24%, rgba(124,92,255,0.20), transparent 34%), linear-gradient(135deg, #030607, #071114 55%, #101308)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.13,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: scan,
          top: 0,
          width: 260,
          height: "100%",
          opacity: 0.18,
          background: "linear-gradient(90deg, transparent, rgba(184,255,70,0.55), transparent)",
          transform: "skewX(-10deg)",
        }}
      />
    </>
  );
}

function Header() {
  const frame = useCurrentFrame();
  const enter = clamp(frame, [0, 24], [0, 1]);

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        right: 64,
        top: 44,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [-20, 0])}px)`,
      }}
    >
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            border: `1px solid ${colors.fenrir}`,
            background: "rgba(8, 15, 18, 0.9)",
            boxShadow: "0 0 32px rgba(184,255,70,0.24)",
          }}
        >
          <Img src={staticFile("fenrir-splash-icon-512.png")} style={{ width: 40, height: 40 }} />
        </div>
        <div>
          <div style={{ color: colors.fenrir, fontSize: 20, textTransform: "uppercase", letterSpacing: 0 }}>
            Fenrir Bridge release gate
          </div>
          <div style={{ color: colors.text, fontSize: 46, fontWeight: 800, letterSpacing: 0 }}>
            Go / No-Go Solution
          </div>
        </div>
      </div>
      <div
        style={{
          border: `1px solid ${colors.line}`,
          borderRadius: 14,
          padding: "16px 20px",
          background: colors.panel,
          color: colors.muted,
          fontSize: 22,
          maxWidth: 520,
          textAlign: "right",
        }}
      >
        Temporal turns deploys into an auditable launch decision.
      </div>
    </div>
  );
}

function TemporalCore() {
  const frame = useCurrentFrame();
  const enter = clamp(frame, [18, 54], [0, 1]);
  const glow = interpolate(Math.sin(frame / 9), [-1, 1], [0.45, 1]);

  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        top: 202,
        width: 500,
        height: 680,
        borderRadius: 28,
        border: `1px solid rgba(124,92,255,${0.4 + glow * 0.25})`,
        background: "linear-gradient(180deg, rgba(16,18,32,0.96), rgba(8,15,18,0.88))",
        boxShadow: `0 0 ${44 + glow * 24}px rgba(124,92,255,0.26)`,
        padding: 34,
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [-30, 0])}px)`,
      }}
    >
      <div style={{ color: colors.temporal, fontSize: 24, textTransform: "uppercase", letterSpacing: 0 }}>
        Temporal workflow
      </div>
      <div style={{ color: colors.text, fontSize: 42, lineHeight: 1.04, fontWeight: 800, marginTop: 12 }}>
        FenrirGoNoGoWorkflow
      </div>
      <div style={{ color: colors.muted, fontSize: 23, lineHeight: 1.36, marginTop: 18 }}>
        Deterministic workflow history records the candidate, checks, evidence, verdict, and rollback state.
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 38 }}>
        {["Task queue: fenrir-release-gate", "GO requires every critical check", "NO-GO freezes traffic changes", "Signals: cancel, approve, rollback"].map((item, index) => {
          const itemEnter = clamp(frame, [70 + index * 12, 92 + index * 12], [0, 1]);
          return (
            <div
              key={item}
              style={{
                opacity: itemEnter,
                transform: `translateY(${interpolate(itemEnter, [0, 1], [18, 0])}px)`,
                border: `1px solid ${colors.line}`,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 14,
                padding: "15px 18px",
                color: colors.text,
                fontSize: 22,
              }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepCard({
  step,
  index,
}: {
  step: (typeof steps)[number];
  index: number;
}) {
  const frame = useCurrentFrame();
  const start = timeline[index];
  const enter = clamp(frame, [start, start + 26], [0, 1]);
  const active = frame >= start && frame < start + 72;
  const color = laneColor(step.lane);

  return (
    <div
      style={{
        position: "absolute",
        left: 650 + (index % 3) * 386,
        top: 228 + Math.floor(index / 3) * 286,
        width: 330,
        minHeight: 214,
        borderRadius: 22,
        padding: 24,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [34, 0])}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`,
        border: `1px solid ${active ? color : colors.line}`,
        background: active
          ? `linear-gradient(180deg, ${color}24, rgba(8,15,18,0.92))`
          : colors.panel,
        boxShadow: active ? `0 0 38px ${color}33` : "0 18px 34px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color, fontSize: 18, textTransform: "uppercase", letterSpacing: 0 }}>{step.label}</span>
        <span
          style={{
            color: colors.bg,
            background: color,
            borderRadius: 999,
            padding: "5px 10px",
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div style={{ color: colors.text, fontSize: 31, fontWeight: 800, lineHeight: 1.05, marginTop: 16 }}>
        {step.title}
      </div>
      <div style={{ color: colors.muted, fontSize: 20, lineHeight: 1.32, marginTop: 14 }}>
        {step.body}
      </div>
    </div>
  );
}

function Connectors() {
  const frame = useCurrentFrame();
  const progress = clamp(frame, [70, 330], [0, 1]);
  const width = 1030 * progress;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 606,
          top: 486,
          width,
          height: 4,
          background: `linear-gradient(90deg, ${colors.temporal}, ${colors.fenrir}, ${colors.cloud}, ${colors.neon}, ${colors.warn})`,
          borderRadius: 999,
          boxShadow: "0 0 24px rgba(184,255,70,0.28)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 606,
          top: 772,
          width: Math.max(0, width - 260),
          height: 4,
          background: `linear-gradient(90deg, ${colors.cloud}, ${colors.neon}, ${colors.warn})`,
          borderRadius: 999,
          opacity: 0.72,
        }}
      />
    </>
  );
}

function FailureRail() {
  const frame = useCurrentFrame();
  const enter = clamp(frame, [352, 386], [0, 1]);

  return (
    <div
      style={{
        position: "absolute",
        right: 64,
        bottom: 58,
        width: 674,
        borderRadius: 22,
        border: `1px solid ${colors.red}88`,
        background: "linear-gradient(90deg, rgba(255,77,109,0.15), rgba(8,15,18,0.92))",
        padding: "22px 26px",
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [28, 0])}px)`,
      }}
    >
      <div style={{ color: colors.red, fontSize: 20, textTransform: "uppercase", letterSpacing: 0 }}>
        NO-GO path
      </div>
      <div style={{ color: colors.text, fontSize: 28, fontWeight: 800, marginTop: 8 }}>
        If any critical check fails: hold traffic, roll back if needed, notify operator.
      </div>
    </div>
  );
}

function BottomRail() {
  const frame = useCurrentFrame();
  const enter = clamp(frame, [390, 430], [0, 1]);

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        bottom: 58,
        display: "flex",
        gap: 14,
        opacity: enter,
      }}
    >
      {["release candidate", "preflight evidence", "Cloud Run candidate", "auth probes", "GO / NO-GO verdict"].map((item, index) => (
        <div
          key={item}
          style={{
            border: `1px solid ${index === 4 ? colors.warn : colors.line}`,
            borderRadius: 999,
            padding: "12px 16px",
            color: index === 4 ? colors.warn : colors.text,
            background: "rgba(8,15,18,0.76)",
            fontSize: 20,
          }}
        >
          {item}
        </div>
      ))}
    </div>
  );
}

export function FenrirDeployTemporalFlow() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const finale = clamp(frame, [durationInFrames - 60, durationInFrames - 18], [0, 1]);

  return (
    <AbsoluteFill style={{ background: colors.bg, fontFamily: "Inter, Arial, sans-serif" }}>
      <Background />
      <Header />
      <TemporalCore />
      <Connectors />
      {steps.map((step, index) => (
        <StepCard key={step.title} step={step} index={index} />
      ))}
      <FailureRail />
      <BottomRail />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: finale,
          background: "radial-gradient(circle at center, rgba(184,255,70,0.2), rgba(3,6,7,0.92) 62%)",
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ color: colors.fenrir, fontSize: 30, textTransform: "uppercase", letterSpacing: 0 }}>
            launch verdict locked
          </div>
          <div style={{ color: colors.text, fontSize: 82, fontWeight: 900, letterSpacing: 0, marginTop: 10 }}>
            Fenrir ships only on GO
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
