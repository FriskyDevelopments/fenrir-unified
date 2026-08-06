import "./index.css";
import { Composition } from "remotion";
import { FenrirDeployTemporalFlow } from "./DeployTemporalFlow";
import { AuraWidgetsShowcase } from "./AuraWidgetsShowcase";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FenrirDeployTemporalFlow"
        component={FenrirDeployTemporalFlow}
        durationInFrames={480}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AuraWidgetsShowcase"
        component={AuraWidgetsShowcase}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
