import { useContext } from 'react';
import { Ctx } from './AuthContext';

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
