// Hawkeye Brand Theme - Matching the cyberpunk puppy logo
export const theme = {
  colors: {
    // Primary - Cyan/Teal from logo
    primary: "#00E5FF",
    primaryDark: "#00BCD4",
    primaryGlow: "rgba(0, 229, 255, 0.4)",

    // Secondary - Purple accent
    secondary: "#7C4DFF",
    secondaryGlow: "rgba(124, 77, 255, 0.3)",

    // Background gradients
    bgDark: "#0a0a0f",
    bgMid: "#0f1419",
    bgLight: "#1a1f2e",

    // Text
    textPrimary: "#ffffff",
    textSecondary: "rgba(255, 255, 255, 0.7)",
    textMuted: "rgba(255, 255, 255, 0.5)",

    // Accent colors for features
    green: "#00E676",
    blue: "#2196F3",
    orange: "#FF9800",
    pink: "#FF4081",
  },

  fonts: {
    heading: "'Inter', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },

  gradients: {
    primary: "linear-gradient(135deg, #00E5FF 0%, #00BCD4 100%)",
    background: "linear-gradient(135deg, #0a0a0f 0%, #0f1419 50%, #1a1f2e 100%)",
    glow: "radial-gradient(circle, rgba(0, 229, 255, 0.3) 0%, transparent 70%)",
    circuit: "repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(0, 229, 255, 0.03) 50px, rgba(0, 229, 255, 0.03) 51px)",
  },
};
