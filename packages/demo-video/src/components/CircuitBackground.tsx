import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../styles/theme";

export const CircuitBackground: React.FC = () => {
  const frame = useCurrentFrame();

  // Animated grid lines
  const gridOffset = (frame * 0.5) % 100;

  return (
    <AbsoluteFill style={{ opacity: 0.4 }}>
      {/* Horizontal circuit lines */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute" }}
      >
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="30%" stopColor={theme.colors.primary} stopOpacity="0.3" />
            <stop offset="70%" stopColor={theme.colors.primary} stopOpacity="0.3" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <linearGradient id="vertGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="30%" stopColor={theme.colors.primary} stopOpacity="0.2" />
            <stop offset="70%" stopColor={theme.colors.primary} stopOpacity="0.2" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Horizontal lines */}
        {[200, 400, 600, 800].map((y, i) => (
          <line
            key={`h-${i}`}
            x1="0"
            y1={y}
            x2="1920"
            y2={y}
            stroke="url(#lineGradient)"
            strokeWidth="1"
            opacity={0.5}
          />
        ))}

        {/* Vertical lines */}
        {[300, 600, 900, 1200, 1500].map((x, i) => (
          <line
            key={`v-${i}`}
            x1={x}
            y1="0"
            x2={x}
            y2="1080"
            stroke="url(#vertGradient)"
            strokeWidth="1"
            opacity={0.3}
          />
        ))}

        {/* Animated dots at intersections */}
        {[200, 400, 600, 800].flatMap((y, yi) =>
          [300, 600, 900, 1200, 1500].map((x, xi) => {
            const delay = (yi + xi) * 10;
            const pulse = Math.sin((frame - delay) * 0.1) * 0.5 + 0.5;
            return (
              <circle
                key={`dot-${yi}-${xi}`}
                cx={x}
                cy={y}
                r={3}
                fill={theme.colors.primary}
                opacity={pulse * 0.6}
              />
            );
          })
        )}
      </svg>

      {/* Corner glow effects */}
      <div
        style={{
          position: "absolute",
          top: -200,
          right: -200,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.colors.primaryGlow} 0%, transparent 70%)`,
          filter: "blur(100px)",
          opacity: interpolate(frame, [0, 30], [0, 0.5]),
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -200,
          left: -200,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.colors.secondaryGlow} 0%, transparent 70%)`,
          filter: "blur(100px)",
          opacity: 0.3,
        }}
      />
    </AbsoluteFill>
  );
};
