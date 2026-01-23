import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "../styles/theme";

const ArchBlock: React.FC<{
  label: string;
  icon: string;
  x: number;
  y: number;
  delay: number;
  frame: number;
  fps: number;
  color: string;
  subItems?: string[];
}> = ({ label, icon, x, y, delay, frame, fps, color, subItems }) => {
  const localFrame = Math.max(0, frame - delay);

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, mass: 0.5 },
  });

  const opacity = interpolate(localFrame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`,
          border: `2px solid ${color}`,
          borderRadius: 16,
          padding: "20px 28px",
          minWidth: 160,
          boxShadow: `0 8px 32px ${color}20`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: subItems ? 12 : 0,
          }}
        >
          <span style={{ fontSize: 28 }}>{icon}</span>
          <span
            style={{
              color: theme.colors.textPrimary,
              fontSize: 18,
              fontWeight: 700,
              fontFamily: theme.fonts.heading,
            }}
          >
            {label}
          </span>
        </div>
        {subItems && (
          <div style={{ paddingLeft: 40 }}>
            {subItems.map((item, i) => (
              <div
                key={i}
                style={{
                  fontSize: 13,
                  color: theme.colors.textMuted,
                  fontFamily: theme.fonts.body,
                  marginBottom: 4,
                }}
              >
                • {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const AnimatedArrow: React.FC<{
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
  frame: number;
  color: string;
}> = ({ fromX, fromY, toX, toY, delay, frame, color }) => {
  const progress = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const currentX = fromX + (toX - fromX) * progress;
  const currentY = fromY + (toY - fromY) * progress;

  // Animated dash
  const dashOffset = -frame * 2;

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <defs>
        <marker
          id={`arrowhead-${delay}`}
          markerWidth="12"
          markerHeight="8"
          refX="10"
          refY="4"
          orient="auto"
        >
          <polygon points="0 0, 12 4, 0 8" fill={color} />
        </marker>
        <linearGradient id={`lineGrad-${delay}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="50%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <line
        x1={fromX}
        y1={fromY}
        x2={currentX}
        y2={currentY}
        stroke={`url(#lineGrad-${delay})`}
        strokeWidth="3"
        markerEnd={progress > 0.9 ? `url(#arrowhead-${delay})` : ""}
        strokeDasharray="8,4"
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
};

export const ArchitectureDiagram: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: 50,
      }}
    >
      {/* Title */}
      <h2
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: theme.colors.textPrimary,
          margin: 0,
          opacity: titleOpacity,
          fontFamily: theme.fonts.heading,
        }}
      >
        <span style={{ color: theme.colors.primary }}>Powered by</span> Local-First Architecture
      </h2>

      {/* Diagram Container */}
      <div
        style={{
          position: "relative",
          width: 1400,
          height: 700,
          marginTop: 20,
        }}
      >
        {/* Arrows */}
        <AnimatedArrow
          fromX={380}
          fromY={280}
          toX={530}
          toY={280}
          delay={25}
          frame={frame}
          color={theme.colors.primary}
        />
        <AnimatedArrow
          fromX={780}
          fromY={280}
          toX={930}
          toY={280}
          delay={35}
          frame={frame}
          color={theme.colors.primary}
        />

        {/* Engine Label */}
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 150,
            opacity: interpolate(frame, [0, 20], [0, 0.6]),
          }}
        >
          <span
            style={{
              color: theme.colors.primary,
              fontSize: 14,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 3,
              fontFamily: theme.fonts.heading,
            }}
          >
            Hawkeye Engine
          </span>
        </div>

        {/* Core Engine Blocks */}
        <ArchBlock
          label="Perception"
          icon="👁️"
          x={140}
          y={220}
          delay={5}
          frame={frame}
          fps={fps}
          color={theme.colors.green}
          subItems={["Screen OCR", "Clipboard", "File Watch"]}
        />
        <ArchBlock
          label="Reasoning"
          icon="🧠"
          x={540}
          y={220}
          delay={20}
          frame={frame}
          fps={fps}
          color={theme.colors.primary}
          subItems={["Claude / Ollama", "Intent Detection"]}
        />
        <ArchBlock
          label="Execution"
          icon="⚡"
          x={940}
          y={220}
          delay={35}
          frame={frame}
          fps={fps}
          color={theme.colors.orange}
          subItems={["Shell Cmds", "File Ops"]}
        />

        {/* Interfaces Label */}
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 470,
            opacity: interpolate(frame, [40, 55], [0, 0.6]),
          }}
        >
          <span
            style={{
              color: theme.colors.secondary,
              fontSize: 14,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 3,
              fontFamily: theme.fonts.heading,
            }}
          >
            Interfaces
          </span>
        </div>

        {/* Interface Blocks */}
        <ArchBlock
          label="Desktop"
          icon="🖥️"
          x={240}
          y={520}
          delay={50}
          frame={frame}
          fps={fps}
          color={theme.colors.secondary}
        />
        <ArchBlock
          label="VS Code"
          icon="🧩"
          x={540}
          y={520}
          delay={55}
          frame={frame}
          fps={fps}
          color={theme.colors.blue}
        />
        <ArchBlock
          label="Chrome"
          icon="🌐"
          x={840}
          y={520}
          delay={60}
          frame={frame}
          fps={fps}
          color={theme.colors.pink}
        />
      </div>
    </AbsoluteFill>
  );
};
