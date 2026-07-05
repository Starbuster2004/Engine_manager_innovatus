'use client';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { Box, LogOut, Shield, Wrench, Star, Crown } from 'lucide-react';
import styles from './Navbar.module.css';

const roleLabels = {
  operator: 'Operator',
  supervisor: 'Supervisor',
  plant_manager: 'Plant Manager',
};

const roleColors = {
  operator: 'var(--accent-blue)',
  supervisor: 'var(--accent-orange)',
  plant_manager: 'var(--accent-purple)',
};

const RoleIcon = ({ role }) => {
  const iconProps = { size: 12, strokeWidth: 2.5 };
  if (role === 'operator') return <Wrench {...iconProps} />;
  if (role === 'supervisor') return <Star {...iconProps} />;
  return <Crown {...iconProps} />;
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <nav className={styles.nav}>
      <div className={styles.left}>
        <div className={styles.brand}>
          <div className={styles.logoContainer}>
            <Box size={18} strokeWidth={2.5} />
          </div>
          <span>EngineTrace</span>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.roleTag} style={{ borderColor: roleColors[user.role], color: roleColors[user.role] }}>
          <RoleIcon role={user.role} />
          {roleLabels[user.role]}
        </div>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>
            {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className={styles.userName}>{user.full_name}</span>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout} title="Sign Out">
          <LogOut size={14} strokeWidth={2} />
          <span className={styles.logoutText}>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
