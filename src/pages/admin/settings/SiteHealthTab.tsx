import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import {
  Section, SECTIONS, CleanAction, CLEAN_ACTIONS,
  HealthResult, SecurityResult, PhotoResult, S3Result, XmlResult, XmlQualityResult,
  req,
} from './siteHealthTypes';
import { HealthSection, SecuritySection } from './SiteHealthDiagnostics';
import { PhotoSection, S3Section, XmlSection } from './SiteHealthMedia';
import SiteHealthClean from './SiteHealthClean';

export default function SiteHealthTab() {
  const [section, setSection] = useState<Section>('health');

  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [security, setSecurity] = useState<SecurityResult | null>(null);
  const [secLoading, setSecLoading] = useState(false);

  const [photos, setPhotos] = useState<PhotoResult | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const [s3, setS3] = useState<S3Result | null>(null);
  const [s3Loading, setS3Loading] = useState(false);

  const [xml, setXml] = useState<XmlResult | null>(null);
  const [xmlLoading, setXmlLoading] = useState(false);

  const [xmlQuality, setXmlQuality] = useState<XmlQualityResult | null>(null);
  const [xmlQualityLoading, setXmlQualityLoading] = useState(false);

  const [running, setRunning] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<{ id: string; msg: string; ok: boolean }[]>([]);

  const loadHealth = async () => {
    setHealthLoading(true);
    try { const d = await req('site_health&action=check'); if (!d.error) setHealth(d); else toast.error(d.error); }
    catch { toast.error('Ошибка проверки'); }
    finally { setHealthLoading(false); }
  };

  const loadSecurity = async () => {
    setSecLoading(true);
    try { const d = await req('site_health&action=scan_security'); if (!d.error) setSecurity(d); else toast.error(d.error); }
    catch { toast.error('Ошибка сканирования'); }
    finally { setSecLoading(false); }
  };

  const loadPhotos = async () => {
    setPhotoLoading(true);
    try { const d = await req('site_health&action=scan_photos'); if (!d.error) setPhotos(d); else toast.error(d.error); }
    catch { toast.error('Ошибка проверки фото'); }
    finally { setPhotoLoading(false); }
  };

  const loadS3 = async () => {
    setS3Loading(true);
    try { const d = await req('site_health&action=s3_stats'); if (!d.error) setS3(d); else toast.error(d.error); }
    catch { toast.error('Ошибка S3'); }
    finally { setS3Loading(false); }
  };

  const loadXml = async () => {
    setXmlLoading(true);
    try { const d = await req('site_health&action=xml_check'); if (!d.error) setXml(d); else toast.error(d.error); }
    catch { toast.error('Ошибка проверки фидов'); }
    finally { setXmlLoading(false); }
  };

  const loadXmlQuality = async () => {
    setXmlQualityLoading(true);
    try { const d = await req('site_health&action=xml_quality'); if (!d.error) setXmlQuality(d); else toast.error(d.error); }
    catch { toast.error('Ошибка анализа качества'); }
    finally { setXmlQualityLoading(false); }
  };

  const runAction = async (action: CleanAction) => {
    if (action.confirm && !confirm(action.confirm)) return;
    setRunning(action.id);
    try {
      const d = await req(`site_health&action=${action.id}`, { method: 'POST', body: '{}' });
      if (d.error) { setActionLog(l => [...l, { id: action.id, msg: d.error, ok: false }]); toast.error(d.error); }
      else { const msg = d.message || 'Выполнено'; setActionLog(l => [...l, { id: action.id, msg, ok: true }]); toast.success(msg); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      setActionLog(l => [...l, { id: action.id, msg, ok: false }]); toast.error(msg);
    } finally { setRunning(null); }
  };

  const fixBrokenPhotosAction = CLEAN_ACTIONS.find(a => a.id === 'fix_broken_photos')!;

  return (
    <div className="space-y-4">

      {/* Навигация по секциям */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-semibold transition ${
              section === s.id ? 'bg-brand-blue text-white border-brand-blue shadow-sm' : 'bg-white border-border hover:bg-muted/50 text-foreground/70'
            }`}>
            <Icon name={s.icon} size={18} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {section === 'health' && (
        <HealthSection health={health} healthLoading={healthLoading} loadHealth={loadHealth} />
      )}
      {section === 'security' && (
        <SecuritySection security={security} secLoading={secLoading} loadSecurity={loadSecurity} />
      )}
      {section === 'photos' && (
        <PhotoSection
          photos={photos} photoLoading={photoLoading} loadPhotos={loadPhotos}
          running={running} runAction={runAction} fixBrokenPhotosAction={fixBrokenPhotosAction}
        />
      )}
      {section === 's3' && (
        <S3Section s3={s3} s3Loading={s3Loading} loadS3={loadS3} />
      )}
      {section === 'xml' && (
        <XmlSection
          xml={xml} xmlLoading={xmlLoading} loadXml={loadXml}
          xmlQuality={xmlQuality} xmlQualityLoading={xmlQualityLoading} loadXmlQuality={loadXmlQuality}
        />
      )}
      {section === 'clean' && (
        <SiteHealthClean running={running} actionLog={actionLog} runAction={runAction} />
      )}
    </div>
  );
}
