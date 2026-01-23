import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";
import { theme } from "../styles/theme";

export const SolutionReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Flash effect
  const flashOpacity = interpolate(frame, [0, 5, 15], [0, 0.8, 0], {
    extrapolateRight: "clamp",
  });

  // Logo animation
  const logoScale = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 10, mass: 0.8 },
  });

  const logoRotation = interpolate(frame, [10, 30], [-10, 0], {
    extrapolateRight: "clamp",
  });

  // Title reveal
  const titleOpacity = interpolate(frame, [25, 45], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [25, 45], [30, 0], {
    extrapolateRight: "clamp",
  });

  // Tagline
  const taglineOpacity = interpolate(frame, [45, 60], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Glow pulse
  const glowPulse = Math.sin(frame * 0.1) * 0.2 + 0.8;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* Flash effect */}
      <AbsoluteFill
        style={{
          backgroundColor: theme.colors.primary,
          opacity: flashOpacity,
        }}
      />

      {/* Glow behind logo */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.colors.primaryGlow} 0%, transparent 60%)`,
          filter: "blur(60px)",
          opacity: glowPulse * 0.6,
        }}
      />

      {/* Logo with circuit frame */}
      <div
        style={{
          transform: `scale(${logoScale}) rotate(${logoRotation}deg)`,
          marginBottom: 30,
          position: "relative",
        }}
      >
        {/* Circuit border effect */}
        <div
          style={{
            position: "absolute",
            top: -20,
            left: -20,
            right: -20,
            bottom: -20,
            border: `2px solid ${theme.colors.primary}`,
            borderRadius: "50%",
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: `0 0 60px ${theme.colors.primaryGlow}`,
          }}
        >
          <Img
            src={staticFile("logo.png")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: 96,
          fontWeight: 900,
          color: theme.colors.textPrimary,
          margin: 0,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: theme.fonts.heading,
          letterSpacing: "-3px",
          textShadow: `0 0 40px ${theme.colors.primaryGlow}`,
        }}
      >
        Hawkeye
      </h1>

      {/* Tagline */}
      <p
        style={{
          fontSize: 32,
          color: theme.colors.primary,
          margin: "20px 0 0 0",
          opacity: taglineOpacity,
          fontFamily: theme.fonts.body,
          fontWeight: 600,
          letterSpacing: "2px",
          textTransform: "uppercase",
        }}
      >
        The First Proactive AI Assistant
      </p>

      {/* Subtext */}
      <p
        style={{
          fontSize: 24,
          color: theme.colors.textSecondary,
          margin: "16px 0 0 0",
          opacity: taglineOpacity,
          fontFamily: theme.fonts.body,
        }}
      >
        Watch keenly. Act thoughtfully.
      </p>
    </AbsoluteFill>
  );
};
