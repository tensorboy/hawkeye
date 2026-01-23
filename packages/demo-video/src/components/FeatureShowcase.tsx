import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "../styles/theme";

const features = [
  {
    icon: "👁️",
    title: "Zero-Prompt Intelligence",
    description: "Automatically understands your screen, clipboard, and files",
    color: theme.colors.green,
  },
  {
    icon: "🔒",
    title: "100% Privacy-First",
    description: "All perception runs locally. Your data never leaves",
    color: theme.colors.primary,
  },
  {
    icon: "🎯",
    title: "Smart Task Tracking",
    description: "Identifies goals and generates actionable next steps",
    color: theme.colors.orange,
  },
  {
    icon: "🔗",
    title: "Multi-Platform Sync",
    description: "Desktop, VS Code, and Chrome work together seamlessly",
    color: theme.colors.secondary,
  },
];

const FeatureCard: React.FC<{
  feature: (typeof features)[0];
  index: number;
  frame: number;
  fps: number;
}> = ({ feature, index, frame, fps }) => {
  const delay = index * 20;
  const localFrame = Math.max(0, frame - delay);

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, mass: 0.6 },
  });

  const opacity = interpolate(localFrame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Highlight effect
  const highlightStart = delay + 40;
  const highlightEnd = delay + 80;
  const isHighlighted = frame > highlightStart && frame < highlightEnd;
  const highlightProgress = interpolate(
    frame,
    [highlightStart, highlightStart + 10, highlightEnd - 10, highlightEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        width: 380,
        padding: 32,
        background: isHighlighted
          ? `linear-gradient(135deg, ${feature.color}15 0%, ${feature.color}08 100%)`
          : `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
        borderRadius: 20,
        transform: `scale(${scale * (1 + highlightProgress * 0.05)})`,
        opacity,
        boxShadow: isHighlighted
          ? `0 0 40px ${feature.color}30, 0 20px 60px rgba(0,0,0,0.3)`
          : "0 8px 40px rgba(0,0,0,0.2)",
        border: `1px solid ${isHighlighted ? feature.color : "rgba(255,255,255,0.08)"}`,
        transition: "background 0.3s, border 0.3s",
      }}
    >
      {/* Icon with glow */}
      <div
        style={{
          fontSize: 56,
          marginBottom: 20,
          filter: isHighlighted ? `drop-shadow(0 0 20px ${feature.color})` : "none",
        }}
      >
        {feature.icon}
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: isHighlighted ? feature.color : theme.colors.textPrimary,
          margin: "0 0 12px 0",
          fontFamily: theme.fonts.heading,
          transition: "color 0.3s",
        }}
      >
        {feature.title}
      </h3>

      {/* Description */}
      <p
        style={{
          fontSize: 16,
          color: theme.colors.textSecondary,
          margin: 0,
          fontFamily: theme.fonts.body,
          lineHeight: 1.5,
        }}
      >
        {feature.description}
      </p>

      {/* Progress indicator when highlighted */}
      {isHighlighted && (
        <div
          style={{
            marginTop: 16,
            height: 3,
            borderRadius: 2,
            background: "rgba(255,255,255,0.1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${highlightProgress * 100}%`,
              height: "100%",
              background: feature.color,
              borderRadius: 2,
            }}
          />
        </div>
      )}
    </div>
  );
};

export const FeatureShowcase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 20], [-20, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        padding: 60,
      }}
    >
      {/* Section Title */}
      <h2
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: theme.colors.textPrimary,
          margin: "0 0 60px 0",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: theme.fonts.heading,
        }}
      >
        <span style={{ color: theme.colors.primary }}>Key</span> Features
      </h2>

      {/* Feature Cards Grid */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 30,
          justifyContent: "center",
          maxWidth: 1600,
        }}
      >
        {features.map((feature, index) => (
          <FeatureCard
            key={index}
            feature={feature}
            index={index}
            frame={frame}
            fps={fps}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
