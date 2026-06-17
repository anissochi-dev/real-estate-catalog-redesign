import { useContext } from 'react';
import { AuthCtxInstance } from './AuthContext';

export function useAuth() {
  const v = useContext(AuthCtxInstance);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
