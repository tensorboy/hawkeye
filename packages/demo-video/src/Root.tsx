import { Composition } from "remotion";
import { HawkeyeDemo } from "./compositions/HawkeyeDemo";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="HawkeyeDemo"
        component={HawkeyeDemo}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
