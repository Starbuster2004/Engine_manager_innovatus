'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    // Route based on role
    if (user.role === 'operator') router.replace('/operator');
    else if (user.role === 'supervisor') router.replace('/supervisor');
    else if (user.role === 'plant_manager') router.replace('/manager');
  }, [user, loading, router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading EngineTrace...</div>
    </div>
  );
}
