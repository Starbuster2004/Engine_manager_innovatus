'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import Navbar from '@/components/Navbar';
import UserManagement from '@/components/UserManagement';
import ProductRegister from '@/components/ProductRegister';
import MapManager from '@/components/MapManager';
import QRViewerModal from '@/components/QRViewerModal';
import { BarChart3, Map, PlusCircle, Users, ScrollText, Download, Activity, ShieldCheck, AlertTriangle, Boxes, QrCode, Gauge } from 'lucide-react';
import styles from './manager.module.css';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';

const COLORS = [
  'var(--accent-blue)', 
  'var(--accent-teal)', 
  'var(--accent-purple)', 
  'var(--accent-orange)', 
  'var(--status-success)', 
  'var(--status-danger)'
];

const chartTooltipStyle = {
  background: '#ffffff',
  border: '1px solid var(--border-default)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  boxShadow: 'var(--shadow-lg)',
  fontSize: '0.75rem',
  fontFamily: 'inherit',
};

export default function ManagerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('analytics');
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeQR, setActiveQR] = useState(null);

  const showQR = (value, title) => {
    setActiveQR({ value, title });
  };

  const renderQRIcon = (value, title) => (
    <button 
      className="btn-qr-icon" 
      onClick={() => showQR(value, title)} 
      title="View Barcode & QR Code"
      type="button"
    >
      <QrCode size={11} strokeWidth={2.5} />
    </button>
  );

  const renderLogDetails = (log) => {
    if (!log.details) return '-';
    
    // Find engine serials like ENG-20260001 or ENGINE-20260001
    // and location codes like LOC-R01-S01-P01 or R01-S01-P01
    const regex = /(ENGINE-\d+|ENG-\d+|(?:LOC-)?R\d+-S\d+-P\d+)/g;
    const text = log.details;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;
      
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }
      
      const isLoc = matchText.includes('R') && matchText.includes('S') && matchText.includes('P');
      let qrValue = matchText;
      let title = '';
      if (isLoc) {
        if (!qrValue.startsWith('LOC-')) {
          qrValue = `LOC-${qrValue}`;
        }
        title = `Rack Slot ${qrValue.replace('LOC-', '')} QR`;
      } else {
        if (!qrValue.startsWith('ENGINE-')) {
          qrValue = `ENGINE-${qrValue}`;
        }
        title = `Engine ${qrValue.replace('ENGINE-', '')} Label`;
      }
      
      parts.push(
        <span key={matchIndex} className="mono" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
          {matchText}
          {renderQRIcon(qrValue, title)}
        </span>
      );
      
      lastIndex = regex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    
    if (parts.length === 0) return text;
    return <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>{parts}</span>;
  };

  useEffect(() => {
    if (!loading && (!user || user.role !== 'plant_manager')) router.replace('/login');
  }, [user, loading, router]);

  const loadData = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const s = await api.stats();
      setStats(s);
      if (tab === 'analytics') setAnalytics(await api.analytics());
      if (tab === 'audit') setAuditLogs(await api.auditLogs(200));
    } catch (err) {
      console.error('Manager poll error (ignored):', err.message);
    }
  }, [tab]);

  useEffect(() => {
    if (user && user.role === 'plant_manager') {
      loadData();
      const interval = setInterval(loadData, 30000);
      return () => clearInterval(interval);
    }
  }, [user, loadData]);

  if (loading) return null;
  if (!user || user.role !== 'plant_manager') return null;

  const tabItems = [
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'locations', label: 'Warehouse Map', icon: Map },
    { key: 'register', label: 'Register Products & Engines', icon: PlusCircle },
    { key: 'users', label: 'Manage Accounts', icon: Users },
    { key: 'audit', label: 'Audit Logs', icon: ScrollText },
  ];

  return (
    <div className="page-container">
      <Navbar />
      <div className="content-area">
        <div className={styles.header}>
          <div>
            <h1>Plant Manager Console</h1>
            <p className={styles.subtitle}>Real-time warehouse intelligence & audit logs</p>
          </div>
        </div>

        <div className={styles.tabs}>
          {tabItems.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.active : ''}`} onClick={() => setTab(t.key)}>
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'analytics' && stats && analytics && (
          <div className="animate-fade">
            {/* Action Bar with Export */}
            <div className={styles.actionBar}>
              <div></div>
              <div className={styles.exportRow}>
                <button className="btn btn-outline" onClick={() => api.exportEngines().catch(e => alert(e.message))}>
                  <Download size={14} />
                  Engines CSV
                </button>
                <button className="btn btn-outline" onClick={() => api.exportMovements().catch(e => alert(e.message))}>
                  <Download size={14} />
                  Movements CSV
                </button>
                <button className="btn btn-outline" onClick={() => api.exportLocations().catch(e => alert(e.message))}>
                  <Download size={14} />
                  Locations CSV
                </button>
              </div>
            </div>

            {/* KPI Row */}
            <div className={`${styles.kpiGrid} stagger-fade`}>
              <KPICard label="Total Engines" value={stats.total_engines} color="var(--accent-blue)" icon={Boxes} />
              <KPICard label="Verification Rate" value={`${analytics.verification_rate.rate}%`} color="var(--status-success)" icon={ShieldCheck} />
              <KPICard label="Unresolved Issues" value={stats.unresolved_mismatches} color={stats.unresolved_mismatches > 0 ? 'var(--status-danger)' : 'var(--status-success)'} icon={AlertTriangle} />
              <KPICard label="Capacity Used" value={`${stats.total_locations > 0 ? Math.round(stats.occupied_locations / stats.total_locations * 100) : 0}%`} color="var(--accent-purple)" icon={Gauge} />
            </div>

            {/* Charts */}
            <div className={styles.chartGrid}>
              {/* Engine Status Distribution */}
              <div className="card-stitch" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Engine Status Distribution</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={analytics.engines_by_status} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} innerRadius={50} label={({ status, count }) => `${status}: ${count}`} labelLine={false}>
                      {analytics.engines_by_status.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Engines by Variant */}
              <div className="card-stitch" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Engines by Variant</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={analytics.engines_by_variant}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                    <XAxis dataKey="variant_code" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                    <Bar dataKey="count" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-blue)" /><stop offset="100%" stopColor="var(--accent-purple)" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Movements Over Time */}
              <div className="card-stitch" style={{ gridColumn: 'span 2', padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Daily Movement Activity (Last 30 Days)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={analytics.movements_by_day}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <defs>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--accent-teal)" /><stop offset="100%" stopColor="var(--accent-blue)" />
                      </linearGradient>
                    </defs>
                    <Line type="monotone" dataKey="count" stroke="url(#lineGrad)" strokeWidth={2.5} dot={{ fill: 'var(--accent-teal)', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Zone Occupancy */}
              <div className="card-stitch" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Zone Occupancy</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={analytics.occupancy_by_zone}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                    <XAxis dataKey="zone" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem' }} />
                    <Bar dataKey="occupied" fill="var(--status-danger)" name="Occupied Slots" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" fill="var(--accent-blue-light)" name="Total Slots" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Verification Summary */}
              <div className="card-stitch" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Verification Summary</h3>
                <div className={styles.verifyStats}>
                  <div className={styles.verifyStat}>
                    <span className={styles.verifyNum} style={{ color: 'var(--status-success)' }}>{analytics.verification_rate.matches}</span>
                    <span className={styles.verifyLabel}>Matches</span>
                  </div>
                  <div className={styles.verifyStat}>
                    <span className={styles.verifyNum} style={{ color: 'var(--status-danger)' }}>{analytics.verification_rate.mismatches}</span>
                    <span className={styles.verifyLabel}>Mismatches</span>
                  </div>
                  <div className={styles.verifyStat}>
                    <span className={styles.verifyNum} style={{ color: 'var(--accent-blue)' }}>{analytics.verification_rate.total}</span>
                    <span className={styles.verifyLabel}>Total</span>
                  </div>
                </div>
                <div className={styles.rateBar}>
                  <div className={styles.rateBarFill} style={{ width: `${analytics.verification_rate.rate}%` }}></div>
                </div>
                <p style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {analytics.verification_rate.rate}% Matching Success Rate
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'locations' && (
          <div className="animate-fade">
            <MapManager currentUserRole={user.role} />
          </div>
        )}

        {tab === 'register' && (
          <div className="animate-fade">
            <ProductRegister currentUserRole={user.role} />
          </div>
        )}

        {tab === 'users' && (
          <div className="animate-fade">
            <UserManagement currentUserRole={user.role} />
          </div>
        )}

        {tab === 'audit' && (
          <div className="animate-fade">
            <div className={styles.actionBar}>
              <h3 style={{ fontWeight: 600 }}>Audit Trail</h3>
              <button className="btn btn-outline" onClick={() => api.exportAuditLogs().catch(e => alert(e.message))}>
                <Download size={14} />
                Export Audit Log
              </button>
            </div>
            <div className="table-container">
            <table>
              <thead>
                <tr><th>Time</th><th>User Name</th><th>Role</th><th>Action</th><th>Resource</th><th>Details</th><th>IP Address</th></tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ fontWeight: 500 }}>{log.user_name}</td>
                    <td><span className={`badge ${log.role === 'operator' ? 'badge-info' : log.role === 'supervisor' ? 'badge-warning' : 'badge-success'}`}>{log.role}</span></td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.action}</td>
                    <td>{log.resource}</td>
                    <td style={{ fontSize: '0.8rem', maxWidth: '320px' }}>{renderLogDetails(log)}</td>
                    <td className="mono" style={{ fontSize: '0.725rem' }}>{log.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
      {activeQR && (
        <QRViewerModal
          value={activeQR.value}
          title={activeQR.title}
          onClose={() => setActiveQR(null)}
        />
      )}
    </div>
  );
}

function KPICard({ label, value, color, icon: Icon }) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ background: `${color}10`, color: color }}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <div className="kpi-content">
        <div className="kpi-value" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  );
}
