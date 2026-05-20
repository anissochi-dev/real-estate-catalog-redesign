export interface Stage {
  id: number;
  name: string;
  color: string;
  position: number;
  is_terminal: boolean;
  is_win: boolean;
}

export interface Deal {
  id: number;
  title: string;
  stage_id: number;
  stage_name: string;
  stage_color: string;
  owner_id?: number;
  owner_name?: string;
  owner_phone?: string;
  listing_id?: number;
  listing_title?: string;
  assigned_to?: number;
  assignee_name?: string;
  amount?: number;
  commission?: number;
  source?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const ACTIVITY_ICONS: Record<string, string> = {
  note: 'FileText',
  call: 'Phone',
  email: 'Mail',
  meeting: 'Calendar',
  stage_change: 'ArrowRight',
  payment: 'CreditCard',
};
