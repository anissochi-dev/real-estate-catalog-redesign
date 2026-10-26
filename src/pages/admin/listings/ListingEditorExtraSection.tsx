import { useState } from 'react';
import { Listing } from './types';
import ListingExtraBoardsSection from './ListingExtraBoardsSection';
import ListingExtraAvitoSection from './ListingExtraAvitoSection';
import ListingExtraSeoSection from './ListingExtraSeoSection';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  errors?: Record<string, boolean>;
  setErrors?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  aiSeoLoading: boolean;
  aiImproveLoading?: boolean;
  onGenerateSeo: () => void;
  onImproveWithAi?: (fields: string[]) => void;
  canEditSeo?: boolean;
}

export default function ListingEditorExtraSection({
  editing, setEditing, errors = {}, setErrors,
  aiSeoLoading, aiImproveLoading, onGenerateSeo, onImproveWithAi, canEditSeo = true,
}: Props) {
  const [improveOpen, setImproveOpen] = useState(false);
  const [improveFields, setImproveFields] = useState<string[]>(['seo_title', 'seo_description', 'faq']);
  const err = (field: string) => errors[field] ? 'border-red-400 bg-red-50' : '';
  const errWrap = (field: string) => errors[field] ? { 'data-field-error': 'true' as const } : {};
  const clearErr = (field: string) => setErrors?.(v => ({ ...v, [field]: false }));

  return (
    <div className="space-y-1">
      <ListingExtraBoardsSection
        editing={editing}
        setEditing={setEditing}
        err={err}
        errWrap={errWrap}
        clearErr={clearErr}
      />

      <ListingExtraAvitoSection
        editing={editing}
        setEditing={setEditing}
        err={err}
        errWrap={errWrap}
        clearErr={clearErr}
      />

      <ListingExtraSeoSection
        editing={editing}
        setEditing={setEditing}
        aiSeoLoading={aiSeoLoading}
        aiImproveLoading={aiImproveLoading}
        onGenerateSeo={onGenerateSeo}
        onImproveWithAi={onImproveWithAi}
        canEditSeo={canEditSeo}
        improveOpen={improveOpen}
        setImproveOpen={setImproveOpen}
        improveFields={improveFields}
        setImproveFields={setImproveFields}
      />
    </div>
  );
}
