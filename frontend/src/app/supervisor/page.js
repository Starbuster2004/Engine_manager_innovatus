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
import { LayoutDashboard, Package, AlertTriangle, Map, Car, PlusCircle, Users, RefreshCw, QrCode } from 'lucide-react';
import styles from './supervisor.module.css';


const statusBadge = (status) => {
  const map = { in_storage: 'badge-info', in_transit: 'badge-warning', assembled: 'badge-success', quarantined: 'badge-danger', scrapped: 'badge-danger' };
  return map[status] || 'badge-info';
};

export default function SupervisorPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [engines, setEngines] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [movements, setMovements] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
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

  useEffect(() => {
    if (!loading && (!user || (user.role !== 'supervisor' && user.role !== 'plant_manager'))) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const loadData = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      if (tab === 'overview') {
        const [s, m] = await Promise.all([api.stats(), api.movements(20)]);
        setStats(s); setMovements(m);
      } else if (tab === 'inventory') {
        setEngines(await api.engines());
      } else if (tab === 'incidents') {
        setIncidents(await api.incidents());
      } else if (tab === 'vehicles') {
        setVehicles(await api.vehicles());
      }
      // Skip for tabs using embedded components: 'users', 'register', 'locations'
    } catch (err) {
      console.error('Dashboard poll error (ignored):', err.message);
    }
  }, [tab]);

  useEffect(() => {
    if (user && (user.role === 'supervisor' || user.role === 'plant_manager')) {
      loadData();
      const interval = setInterval(loadData, 15000);
      return () => clearInterval(interval);
    }
  }, [user, loadData]);

  const resolveIncident = async (id) => {
    try {
      await api.resolveIncident(id);
      setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, resolved: 1 } : i)));
    } catch (err) { alert(err.message); }
  };

  if (loading) return null;
  if (!user || (user.role !== 'supervisor' && user.role !== 'plant_manager')) return null;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'inventory', label: 'Inventory', icon: Package },
    { key: 'incidents', label: 'Incidents', icon: AlertTriangle },
    { key: 'locations', label: 'Warehouse Map', icon: Map },
    { key: 'vehicles', label: 'Vehicles', icon: Car },
    { key: 'register', label: 'Register Engine', icon: PlusCircle },
    { key: 'users', label: 'Manage Operators', icon: Users },
  ];

  return (
    <div className="page-container">
      <Navbar />
      <div className="content-area">
        <div className={styles.header}>
          <h1>Supervisor Dashboard</h1>
          <button className="btn btn-outline" onClick={loadData} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? styles.spinning : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className={styles.tabs}>
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.activeTab : ''}`} onClick={() => setTab(t.key)}>
                <Icon size={14} />
                {t.label}
                {t.key === 'incidents' && stats?.unresolved_mismatches > 0 && (
                  <span className={styles.badge}>{stats.unresolved_mismatches}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {tab === 'overview' && stats && (
          <div className="animate-fade">
            <div className="grid-stats stagger-fade">
              <StatCard label="Total Engines" value={stats.total_engines} color="var(--accent-blue)" />
              <StatCard label="In Storage" value={stats.in_storage} color="var(--accent-teal)" />
              <StatCard label="In Transit" value={stats.in_transit} color="var(--accent-orange)" />
              <StatCard label="Assembled" value={stats.assembled} color="var(--status-success)" />
              <StatCard label="Quarantined" value={stats.quarantined} color="var(--status-danger)" />
              <StatCard label="Occupied Slots" value={`${stats.occupied_locations}/${stats.total_locations}`} color="var(--accent-purple)" />
              <StatCard label="Pending Vehicles" value={stats.pending_vehicles} color="var(--accent-blue)" />
              <StatCard label="Unresolved Issues" value={stats.unresolved_mismatches} color={stats.unresolved_mismatches > 0 ? 'var(--status-danger)' : 'var(--status-success)'} />
            </div>

            <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Recent Movements</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Engine</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>By</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="mono" style={{ fontSize: '0.8rem' }}>
                        {m.engine_serial}
                        {renderQRIcon(`ENGINE-${m.engine_serial}`, `Engine ${m.engine_serial} Label`)}
                      </td>
                      <td><span className={`badge ${m.movement_type === 'put_away' ? 'badge-info' : m.movement_type === 'retrieval' ? 'badge-warning' : 'badge-success'}`}>{m.movement_type}</span></td>
                      <td className="mono" style={{ fontSize: '0.8rem' }}>
                        {m.from_location || '-'}
                        {m.from_location && renderQRIcon(`LOC-${m.from_location}`, `Rack Slot ${m.from_location} QR`)}
                      </td>
                      <td className="mono" style={{ fontSize: '0.8rem' }}>
                        {m.to_location || '-'}
                        {m.to_location && renderQRIcon(`LOC-${m.to_location}`, `Rack Slot ${m.to_location} QR`)}
                      </td>
                      <td>{m.performed_by}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(m.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Inventory Tab */}
        {tab === 'inventory' && (
          <div className="animate-fade">
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Serial</th><th>Variant</th><th>Fuel</th><th>Status</th><th>Location</th><th>Mfg Date</th></tr>
                </thead>
                <tbody>
                  {engines.map((e) => (
                    <tr key={e.id}>
                      <td className="mono" style={{ fontSize: '0.8rem' }}>
                        {e.engine_serial}
                        {renderQRIcon(`ENGINE-${e.engine_serial}`, `Engine ${e.engine_serial} Label`)}
                      </td>
                      <td>{e.variant_code}</td>
                      <td>{e.fuel_type}</td>
                      <td><span className={`badge ${statusBadge(e.status)}`}>{e.status}</span></td>
                      <td className="mono" style={{ fontSize: '0.8rem' }}>
                        {e.location_code || '-'}
                        {e.location_code && renderQRIcon(`LOC-${e.location_code}`, `Rack Slot ${e.location_code} QR`)}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{e.manufacturing_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Incidents Tab */}
        {tab === 'incidents' && (
          <div className="animate-fade">
            {incidents.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>No incidents found</p>}
            <div className={styles.incidentList}>
              {incidents.map((inc) => (
                <div key={inc.id} className={`card-stitch ${inc.result === 'mismatch' && !inc.resolved ? styles.incidentDanger : ''}`}>
                  <div className={styles.incidentHeader}>
                    <span className={`badge ${inc.result === 'match' ? 'badge-success' : inc.resolved ? 'badge-warning' : 'badge-danger'}`}>
                      {inc.result === 'match' ? 'Match' : inc.resolved ? 'Resolved' : 'Unresolved'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(inc.timestamp).toLocaleString()}</span>
                  </div>
                  <div className={styles.incidentBody}>
                    <div><span>VIN:</span> <strong className="mono">{inc.vehicle_vin}</strong></div>
                    <div>
                      <span>Engine:</span> 
                      <strong className="mono">
                        {inc.engine_serial}
                        {renderQRIcon(`ENGINE-${inc.engine_serial}`, `Engine ${inc.engine_serial} Label`)}
                      </strong>
                    </div>
                    <div><span>Expected:</span> <strong>{inc.expected_variant}</strong></div>
                    <div><span>Actual:</span> <strong style={{ color: inc.result === 'mismatch' ? 'var(--status-danger)' : 'inherit' }}>{inc.actual_variant}</strong></div>
                    <div><span>Verified by:</span> <strong>{inc.verified_by}</strong></div>
                  </div>
                  {inc.result === 'mismatch' && !inc.resolved && (
                    <button className="btn btn-success" onClick={() => resolveIncident(inc.id)} style={{ marginTop: '1rem', width: '100%' }}>
                      Mark as Resolved
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locations Tab */}
        {tab === 'locations' && (
          <div className="animate-fade">
            <MapManager currentUserRole={user.role} />
          </div>
        )}

        {/* Register Engine Tab */}
        {tab === 'register' && (
          <div className="animate-fade">
            <ProductRegister currentUserRole={user.role} />
          </div>
        )}

        {/* Manage Users Tab */}
        {tab === 'users' && (
          <div className="animate-fade">
            <UserManagement currentUserRole={user.role} />
          </div>
        )}

        {/* Vehicles Tab */}
        {tab === 'vehicles' && (
          <div className="animate-fade table-container">
            <table>
              <thead>
                <tr><th>VIN</th><th>Model</th><th>Required Variant</th><th>Status</th><th>Assigned Engine</th></tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="mono" style={{ fontSize: '0.8rem' }}>{v.vin}</td>
                    <td>{v.model_name}</td>
                    <td><span className="badge badge-info">{v.required_variant}</span></td>
                    <td><span className={`badge ${v.assembly_status === 'completed' ? 'badge-success' : v.assembly_status === 'pending' ? 'badge-warning' : 'badge-info'}`}>{v.assembly_status}</span></td>
                    <td className="mono" style={{ fontSize: '0.8rem' }}>
                      {v.assigned_engine || '-'}
                      {v.assigned_engine && renderQRIcon(`ENGINE-${v.assigned_engine}`, `Engine ${v.assigned_engine} Label`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

function StatCard({ label, value, color }) {
  return (
    <div className="card-stitch" style={{ padding: '1.25rem 1.5rem' }}>
      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: color || 'var(--text-primary)', fontFamily: "'Geist', sans-serif", letterSpacing: '-0.03em' }}>{value}</div>
    </div>
  );
}
