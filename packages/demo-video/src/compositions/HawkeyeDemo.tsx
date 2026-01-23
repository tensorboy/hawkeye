import {
  AbsoluteFill,
  Sequence,
  staticFile,
  Img,
} from "remotion";
import { theme } from "../styles/theme";
import { ProblemScene } from "../components/ProblemScene";
import { SolutionReveal } from "../components/SolutionReveal";
import { FeatureShowcase } from "../components/FeatureShowcase";
import { AppUIDemo } from "../components/AppUIDemo";
import { ArchitectureDiagram } from "../components/ArchitectureDiagram";
import { CallToAction } from "../components/CallToAction";
import { CircuitBackground } from "../components/CircuitBackground";

export const HawkeyeDemo: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: theme.gradients.background,
      }}
    >
      {/* Animated circuit background */}
      <CircuitBackground />

      {/* Scene 1: Problem Statement (0-90 frames = 3 seconds) */}
      <Sequence from={0} durationInFrames={90}>
        <ProblemScene />
      </Sequence>

      {/* Scene 2: Solution Reveal with Logo (90-180 frames = 3 seconds) */}
      <Sequence from={90} durationInFrames={90}>
        <SolutionReveal />
      </Sequence>

      {/* Scene 3: Key Features (180-330 frames = 5 seconds) */}
      <Sequence from={180} durationInFrames={150}>
        <FeatureShowcase />
      </Sequence>

      {/* Scene 4: App UI Demo (330-450 frames = 4 seconds) */}
      <Sequence from={330} durationInFrames={120}>
        <AppUIDemo />
      </Sequence>

      {/* Scene 5: Architecture (450-540 frames = 3 seconds) */}
      <Sequence from={450} durationInFrames={90}>
        <ArchitectureDiagram />
      </Sequence>

      {/* Scene 6: Call to Action (540-600 frames = 2 seconds) */}
      <Sequence from={540} durationInFrames={60}>
        <CallToAction />
      </Sequence>
    </AbsoluteFill>
  );
};
