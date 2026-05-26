import { S, PingState } from './types';
import IntegrationsAiSection from './IntegrationsAiSection';
import IntegrationsMapsPaySection from './IntegrationsMapsPaySection';
import IntegrationsSecuritySection from './IntegrationsSecuritySection';
import IntegrationsWebmasterSection from './IntegrationsWebmasterSection';
import IntegrationsMaxSection from './IntegrationsMaxSection';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  showMapsKey: boolean;
  setShowMapsKey: (v: boolean) => void;
  showYkSecret: boolean;
  setShowYkSecret: (v: boolean) => void;
  pingState: PingState;
  mapsState: PingState;
  ykState: PingState;
  testConnection: () => void;
  testMapsKey: () => void;
  testYookassa: () => void;
}

export default function IntegrationsTab({
  s, setS, saved, save,
  showKey, setShowKey, showMapsKey, setShowMapsKey,
  showYkSecret, setShowYkSecret,
  pingState, mapsState, ykState,
  testConnection, testMapsKey, testYookassa,
}: Props) {
  return (
    <div className="space-y-4">
      <IntegrationsAiSection
        s={s} setS={setS} saved={saved} save={save}
        showKey={showKey} setShowKey={setShowKey}
        pingState={pingState} testConnection={testConnection}
      />
      <IntegrationsMapsPaySection
        s={s} setS={setS}
        showMapsKey={showMapsKey} setShowMapsKey={setShowMapsKey}
        showYkSecret={showYkSecret} setShowYkSecret={setShowYkSecret}
        mapsState={mapsState} ykState={ykState}
        testMapsKey={testMapsKey} testYookassa={testYookassa}
      />
      <IntegrationsMaxSection s={s} setS={setS} saved={saved} save={save} />
      <IntegrationsSecuritySection s={s} setS={setS} />
      <IntegrationsWebmasterSection s={s} setS={setS} />
    </div>
  );
}