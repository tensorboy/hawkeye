import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const LogoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo scale animation
  const logoScale = spring({
    frame,
    fps,
    config: {
      damping: 12,
      mass: 0.5,
    },
  });

  // Title fade in
  const titleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: "clamp",
  });

  const titleY = interpolate(frame, [20, 40], [30, 0], {
    extrapolateRight: "clamp",
  });

  // Tagline fade in
  const taglineOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Glow effect
  const glowOpacity = interpolate(frame, [0, 30, 60, 90], [0, 0.8, 0.6, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* Glow effect behind logo */}
      <div
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,193,7,0.4) 0%, transparent 70%)",
          opacity: glowOpacity,
          filter: "blur(40px)",
        }}
      />

      {/* Logo placeholder - eagle icon using SVG */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          marginBottom: 30,
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Eagle eye shape */}
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="url(#gradient)"
            stroke="#FFC107"
            strokeWidth="3"
          />
          <circle cx="60" cy="60" r="25" fill="#1a1a2e" />
          <circle cx="60" cy="55" r="12" fill="#FFC107" />
          <circle cx="65" cy="52" r="4" fill="white" />
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="120" y2="120">
              <stop offset="0%" stopColor="#FFC107" />
              <stop offset="100%" stopColor="#FF9800" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: 72,
          fontWeight: 800,
          color: "white",
          margin: 0,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: "-2px",
        }}
      >
        Hawkeye
      </h1>

      {/* Tagline */}
      <p
        style={{
          fontSize: 24,
          color: "#FFC107",
          margin: "16px 0 0 0",
          opacity: taglineOpacity,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 500,
        }}
      >
        The First Proactive AI Assistant for Desktop
      </p>
    </AbsoluteFill>
  );
};
