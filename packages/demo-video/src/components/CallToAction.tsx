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

export const CallToAction: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Elements animation
  const scale = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.5 },
  });

  const textOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Pulse for button
  const pulse = Math.sin(frame * 0.15) * 0.03 + 1;

  // Glow intensity
  const glowIntensity = Math.sin(frame * 0.1) * 0.3 + 0.7;

  // Platform badges slide in
  const badgesOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateRight: "clamp",
  });
  const badgesY = interpolate(frame, [25, 40], [20, 0], {
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
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.colors.primaryGlow} 0%, transparent 50%)`,
          filter: "blur(80px)",
          opacity: glowIntensity * 0.5,
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `scale(${scale * 0.5})`,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: `0 0 40px ${theme.colors.primaryGlow}`,
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

      {/* Main CTA Text */}
      <h2
        style={{
          fontSize: 64,
          fontWeight: 900,
          color: theme.colors.textPrimary,
          margin: 0,
          opacity: textOpacity,
          fontFamily: theme.fonts.heading,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        10x Your Productivity
      </h2>

      {/* Subtitle */}
      <p
        style={{
          fontSize: 28,
          color: theme.colors.primary,
          margin: "16px 0 0 0",
          opacity: textOpacity,
          fontFamily: theme.fonts.body,
          fontWeight: 600,
        }}
      >
        Start for Free Today
      </p>

      {/* CTA Button */}
      <div
        style={{
          marginTop: 40,
          transform: `scale(${scale * pulse})`,
        }}
      >
        <div
          style={{
            background: theme.gradients.primary,
            borderRadius: 50,
            padding: "20px 48px",
            boxShadow: `0 8px 40px ${theme.colors.primaryGlow}`,
          }}
        >
          <span
            style={{
              color: theme.colors.bgDark,
              fontSize: 22,
              fontWeight: 800,
              fontFamily: theme.fonts.heading,
              letterSpacing: "-0.5px",
            }}
          >
            Download Now
          </span>
        </div>
      </div>

      {/* Platform badges */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginTop: 30,
          opacity: badgesOpacity,
          transform: `translateY(${badgesY}px)`,
        }}
      >
        {[
          { icon: "🍎", label: "macOS" },
          { icon: "🪟", label: "Windows" },
          { icon: "🐧", label: "Linux" },
        ].map((platform, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: 30,
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <span style={{ fontSize: 20 }}>{platform.icon}</span>
            <span
              style={{
                color: theme.colors.textSecondary,
                fontSize: 14,
                fontFamily: theme.fonts.body,
                fontWeight: 500,
              }}
            >
              {platform.label}
            </span>
          </div>
        ))}
      </div>

      {/* GitHub link */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 24,
          opacity: badgesOpacity,
        }}
      >
        <span style={{ fontSize: 20 }}>⭐</span>
        <span
          style={{
            color: theme.colors.textMuted,
            fontSize: 16,
            fontFamily: theme.fonts.body,
          }}
        >
          github.com/anthropics/hawkeye
        </span>
      </div>
    </AbsoluteFill>
  );
};
