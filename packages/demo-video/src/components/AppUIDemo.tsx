import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "../styles/theme";

const SuggestionCard: React.FC<{
  title: string;
  description: string;
  icon: string;
  delay: number;
  frame: number;
  fps: number;
}> = ({ title, description, icon, delay, frame, fps }) => {
  const localFrame = Math.max(0, frame - delay);

  const slideIn = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, mass: 0.5 },
  });

  const x = interpolate(slideIn, [0, 1], [100, 0]);
  const opacity = interpolate(slideIn, [0, 1], [0, 1]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: 12,
        border: "1px solid rgba(255, 255, 255, 0.08)",
        transform: `translateX(${x}px)`,
        opacity,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `${theme.colors.primary}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.body,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
          }}
        >
          {description}
        </div>
      </div>
      <div
        style={{
          marginLeft: "auto",
          color: theme.colors.primary,
          fontSize: 12,
          padding: "6px 12px",
          background: `${theme.colors.primary}15`,
          borderRadius: 6,
          fontWeight: 600,
        }}
      >
        Execute
      </div>
    </div>
  );
};

export const AppUIDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Window animation
  const windowScale = spring({
    frame,
    fps,
    config: { damping: 15, mass: 0.8 },
  });

  // Context text typing
  const contextText = "Working on: React component refactoring";
  const charsToShow = Math.min(
    Math.floor((frame - 20) / 1.5),
    contextText.length
  );

  // Scanning line animation
  const scanProgress = interpolate(frame, [25, 60], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      {/* App Window Mock */}
      <div
        style={{
          width: 900,
          height: 600,
          background: "linear-gradient(180deg, #1a1f2e 0%, #0f1419 100%)",
          borderRadius: 16,
          transform: `scale(${windowScale})`,
          boxShadow: `0 40px 100px rgba(0, 0, 0, 0.5), 0 0 60px ${theme.colors.primaryGlow}`,
          border: "1px solid rgba(255, 255, 255, 0.1)",
          overflow: "hidden",
        }}
      >
        {/* Window Header */}
        <div
          style={{
            height: 48,
            background: "rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 8,
            borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#ff5f57",
            }}
          />
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#febc2e",
            }}
          />
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#28c840",
            }}
          />
          <span
            style={{
              marginLeft: "auto",
              fontSize: 14,
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
            }}
          >
            Hawkeye
          </span>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              overflow: "hidden",
              marginLeft: 8,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryDark} 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              🐕
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ padding: 24, display: "flex", gap: 24 }}>
          {/* Left: Context Panel */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                color: theme.colors.primary,
                fontWeight: 600,
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: 1,
                fontFamily: theme.fonts.body,
              }}
            >
              Current Context
            </div>

            {/* Active Window */}
            <div
              style={{
                padding: 16,
                background: "rgba(0, 229, 255, 0.05)",
                borderRadius: 12,
                border: `1px solid ${theme.colors.primary}30`,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>💻</span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.colors.textPrimary,
                    fontFamily: theme.fonts.body,
                  }}
                >
                  VS Code - project/src
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: theme.colors.primary,
                  fontFamily: theme.fonts.mono,
                }}
              >
                {contextText.slice(0, Math.max(0, charsToShow))}
                {charsToShow < contextText.length && charsToShow > 0 && (
                  <span style={{ opacity: frame % 15 < 8 ? 1 : 0 }}>|</span>
                )}
              </div>
            </div>

            {/* Scanning indicator */}
            <div
              style={{
                fontSize: 12,
                color: theme.colors.textMuted,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span>Analyzing screen...</span>
            </div>
            <div
              style={{
                height: 3,
                background: "rgba(255, 255, 255, 0.1)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${scanProgress}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
                  borderRadius: 2,
                }}
              />
            </div>
          </div>

          {/* Right: Suggestions Panel */}
          <div style={{ flex: 1.2 }}>
            <div
              style={{
                fontSize: 12,
                color: theme.colors.green,
                fontWeight: 600,
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: 1,
                fontFamily: theme.fonts.body,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: theme.colors.green,
                  animation: "pulse 1s infinite",
                }}
              />
              AI Suggestions
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SuggestionCard
                icon="🔄"
                title="Extract to Custom Hook"
                description="Move useState logic to useFormState hook"
                delay={60}
                frame={frame}
                fps={fps}
              />
              <SuggestionCard
                icon="📝"
                title="Add TypeScript Types"
                description="Generate interface for component props"
                delay={75}
                frame={frame}
                fps={fps}
              />
              <SuggestionCard
                icon="🧪"
                title="Generate Unit Tests"
                description="Create tests for handleSubmit function"
                delay={90}
                frame={frame}
                fps={fps}
              />
            </div>
          </div>
        </div>

        {/* Bottom status bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 32,
            background: "rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            fontSize: 12,
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.mono,
            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
          }}
        >
          <span style={{ color: theme.colors.green }}>●</span>
          <span style={{ marginLeft: 8 }}>Perception Engine Active</span>
          <span style={{ marginLeft: "auto" }}>3 suggestions ready</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
