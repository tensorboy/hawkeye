import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "../styles/theme";

const TypewriterText: React.FC<{
  text: string;
  startFrame: number;
  frame: number;
}> = ({ text, startFrame, frame }) => {
  const localFrame = Math.max(0, frame - startFrame);
  const charsToShow = Math.floor(localFrame / 2);
  const displayText = text.slice(0, charsToShow);
  const showCursor = localFrame % 10 < 5 && charsToShow < text.length;

  return (
    <span>
      {displayText}
      {showCursor && (
        <span style={{ color: theme.colors.primary }}>|</span>
      )}
    </span>
  );
};

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation
  const titleOpacity = interpolate(frame, [0, 20], [0, 1]);
  const titleY = interpolate(frame, [0, 20], [30, 0]);

  // Problem statements fade in
  const problem1Opacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateRight: "clamp",
  });
  const problem2Opacity = interpolate(frame, [40, 55], [0, 1], {
    extrapolateRight: "clamp",
  });
  const problem3Opacity = interpolate(frame, [55, 70], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Frustration emoji bounce
  const emojiScale = spring({
    frame: Math.max(0, frame - 75),
    fps,
    config: { damping: 8, mass: 0.5 },
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        padding: 100,
      }}
    >
      {/* Question mark icon */}
      <div
        style={{
          fontSize: 80,
          marginBottom: 30,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <span style={{ filter: "grayscale(100%)" }}>🤔</span>
      </div>

      {/* Main question */}
      <h1
        style={{
          fontSize: 56,
          fontWeight: 800,
          color: theme.colors.textPrimary,
          margin: 0,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: theme.fonts.heading,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        Tired of explaining your context
        <br />
        <span style={{ color: theme.colors.primary }}>to AI every single time?</span>
      </h1>

      {/* Problem list */}
      <div
        style={{
          marginTop: 50,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            opacity: problem1Opacity,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span style={{ color: "#EF5350", fontSize: 24 }}>✗</span>
          <span
            style={{
              fontSize: 28,
              color: theme.colors.textSecondary,
              fontFamily: theme.fonts.body,
            }}
          >
            Copy-pasting code snippets
          </span>
        </div>

        <div
          style={{
            opacity: problem2Opacity,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span style={{ color: "#EF5350", fontSize: 24 }}>✗</span>
          <span
            style={{
              fontSize: 28,
              color: theme.colors.textSecondary,
              fontFamily: theme.fonts.body,
            }}
          >
            Describing what you're working on
          </span>
        </div>

        <div
          style={{
            opacity: problem3Opacity,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span style={{ color: "#EF5350", fontSize: 24 }}>✗</span>
          <span
            style={{
              fontSize: 28,
              color: theme.colors.textSecondary,
              fontFamily: theme.fonts.body,
            }}
          >
            Waiting for AI to catch up
          </span>
        </div>
      </div>

      {/* Frustration emoji */}
      <div
        style={{
          marginTop: 40,
          fontSize: 60,
          transform: `scale(${emojiScale})`,
        }}
      >
        😫
      </div>
    </AbsoluteFill>
  );
};
