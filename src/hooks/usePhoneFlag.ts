import { useState, useEffect } from 'react';
import { normalizePhone } from '@/lib/phone';

export type FlagType = 'bad_owner' | 'competitor';

export interface PhoneFlag {
  phone: string;
  flag_type: FlagType;
  comment: string | null;
  created_by_name: string | null;
  created_at: string;
}

const BASE = 'https://functions.poehali.dev/254609bc-df6e-4209-be01-2223b26c1665';

/** Нормализует в формат 7XXXXXXXXXX (без плюса) — как хранит бэкенд */
function norm(phone: string): string {
  return normalizePhone(phone).replace(/^\+/, '');
}

export async function fetchPhoneFlags(phones: string[]): Promise<Record<string, PhoneFlag>> {
  const normalized = phones.map(norm).filter(p => p.length >= 10);
  if (!normalized.length) return {};
  const res = await fetch(`${BASE}?phones=${normalized.join(',')}`);
  if (!res.ok) return {};
  const data = await res.json();
  // Индексируем по обоим форматам: "79..." и "+79..."
  const raw: Record<string, PhoneFlag> = data.flags || {};
  const result: Record<string, PhoneFlag> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = val;
    result['+' + key] = val;
  }
  return result;
}

export async function setPhoneFlag(
  phone: string,
  flag_type: FlagType,
  comment: string,
  token: string
): Promise<void> {
  await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    body: JSON.stringify({ phone: normalizePhone(phone), flag_type, comment }),
  });
}

export async function removePhoneFlag(phone: string, token: string): Promise<void> {
  const n = normalizePhone(phone);
  await fetch(`${BASE}?phone=${n}`, {
    method: 'DELETE',
    headers: { 'X-Auth-Token': token },
  });
}

export function usePhoneFlag(phone: string) {
  const [flag, setFlag] = useState<PhoneFlag | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const n = normalizePhone(phone);
    if (!n || n.replace(/\D/g, '').length < 10) { setFlag(null); return; }
    setLoading(true);
    fetchPhoneFlags([n])
      .then(flags => setFlag(flags[n] || null))
      .finally(() => setLoading(false));
  }, [phone]);

  return { flag, loading };
}