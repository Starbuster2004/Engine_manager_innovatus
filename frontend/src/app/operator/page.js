'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import Navbar from '@/components/Navbar';
import QRScanner from '@/components/QRScanner';
import { Package, Activity, CheckCircle, XCircle, AlertCircle, Camera, Check, ArrowDownToLine, ArrowUpFromLine, ShieldCheck } from 'lucide-react';
import styles from './operator.module.css';

export default function OperatorPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeAction, setActiveAction] = useState(null); // 'putaway' | 'retrieval' | 'verify'
  const [scanStep, setScanStep] = useState(0);
  const [scanData, setScanData] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  // Live queues
  const [inTransitEngines, setInTransitEngines] = useState([]);
  const [inStorageEngines, setInStorageEngines] = useState([]);

  // Embedded form inputs
  const [embeddedVin, setEmbeddedVin] = useState('');
  const [embeddedEngine, setEmbeddedEngine] = useState('');

  useEffect(() => {
    if (!loading && (!user || user.role !== 'operator')) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const fetchOperatorData = useCallback(async () => {
    // Don't fetch if tab is hidden
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const [transit, storage] = await Promise.all([
        api.engines({ status_filter: 'in_transit' }),
        api.engines({ status_filter: 'in_storage' }),
      ]);
      setInTransitEngines(transit.slice(0, 5));
      setInStorageEngines(storage.slice(0, 5));
    } catch (err) {
      // Silently ignore polling errors — don't trigger logout
      console.error("Polling error (ignored):", err.message);
    }
  }, []);

  useEffect(() => {
    if (user && user.role === 'operator') {
      fetchOperatorData();
      const interval = setInterval(fetchOperatorData, 15000); // 15s instead of 5s
      return () => clearInterval(interval);
    }
  }, [user, fetchOperatorData]);

  const resetFlow = () => {
    setActiveAction(null);
    setScanStep(0);
    setScanData({});
    setResult(null);
    setError('');
  };

  // ── Put-Away Flow ──
  const handlePutAway = () => {
    setActiveAction('putaway');
    setScanStep(1);
  };

  const onPutAwayScan = async (qrData) => {
    if (scanStep === 1) {
      setScanData({ engine_qr: qrData });
      setScanStep(2);
    } else if (scanStep === 2) {
      setProcessing(true);
      try {
        const res = await api.putAway({ engine_qr: scanData.engine_qr, location_qr: qrData });
        setResult({ type: 'success', message: res.message || 'Engine successfully stored in location.' });
        setScanStep(0);
        fetchOperatorData();
      } catch (err) {
        setError(err.message);
        setResult({ type: 'error', message: err.message });
        setScanStep(0);
      } finally {
        setProcessing(false);
      }
    }
  };

  // ── Retrieval Flow ──
  const handleRetrieval = () => {
    setActiveAction('retrieval');
    setScanStep(1);
  };

  const onRetrievalScan = async (qrData) => {
    setProcessing(true);
    try {
      const res = await api.retrieval({ engine_qr: qrData });
      setResult({ type: 'success', message: res.message || 'Engine retrieved from storage.' });
      setScanStep(0);
      fetchOperatorData();
    } catch (err) {
      setResult({ type: 'error', message: err.message });
      setScanStep(0);
    } finally {
      setProcessing(false);
    }
  };

  // ── VIN Verification Flow ──
  const handleVerify = () => {
    setActiveAction('verify');
    setScanStep(1);
  };

  const onVerifyScan = async (qrData) => {
    if (scanStep === 1) {
      setScanData({ vehicle_vin: qrData });
      setScanStep(2);
    } else if (scanStep === 2) {
      setProcessing(true);
      try {
        const res = await api.verifyVin({ vehicle_vin: scanData.vehicle_vin, engine_qr: qrData });
        setResult({ type: res.status === 'match' ? 'match' : 'mismatch', ...res });
        setScanStep(0);
      } catch (err) {
        setResult({ type: 'error', message: err.message });
        setScanStep(0);
      } finally {
        setProcessing(false);
      }
    }
  };

  // Embedded verification submission
  const handleEmbeddedVerifySubmit = async (e) => {
    e.preventDefault();
    if (!embeddedVin.trim() || !embeddedEngine.trim()) return;

    setProcessing(true);
    try {
      const qrCode = embeddedEngine.trim().startsWith('ENGINE-') 
        ? embeddedEngine.trim() 
        : `ENGINE-${embeddedEngine.trim()}`;
      
      const res = await api.verifyVin({ 
        vehicle_vin: embeddedVin.trim(), 
        engine_qr: qrCode
      });
      setResult({ type: res.status === 'match' ? 'match' : 'mismatch', ...res });
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setProcessing(false);
      setEmbeddedVin('');
      setEmbeddedEngine('');
    }
  };

  const getScanHandler = () => {
    if (activeAction === 'putaway') return onPutAwayScan;
    if (activeAction === 'retrieval') return onRetrievalScan;
    if (activeAction === 'verify') return onVerifyScan;
    return () => {};
  };

  const getScanLabel = () => {
    if (activeAction === 'putaway') return scanStep === 1 ? 'Scan Engine QR' : 'Scan Location QR';
    if (activeAction === 'retrieval') return 'Scan Engine QR';
    if (activeAction === 'verify') return scanStep === 1 ? 'Scan Vehicle VIN' : 'Scan Engine QR';
    return 'Scan';
  };

  if (loading) return null;
  if (!user || user.role !== 'operator') return null;

  return (
    <div className="page-container">
      <Navbar />
      <div className={styles.container}>
        <div className={styles.greetingSection}>
          <h1>Welcome, {user.full_name}</h1>
          <p className={styles.subtitle}>Warehouse Node Alpha — Terminal view</p>
        </div>

        {/* Main Bento Grid */}
        <div className={`${styles.bentoGrid} stagger-fade`}>
          {/* Put Away Card */}
          <div className={`${styles.cardPutAway} card-stitch`}>
            <div className={styles.cardHeader}>
              <h2>
                <span className={styles.cardHeaderIcon} style={{ background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)' }}>
                  <ArrowDownToLine size={16} strokeWidth={2.5} />
                </span>
                Engine Put-Away
              </h2>
              <div className={styles.cardIcon} style={{ color: 'var(--accent-blue)' }}>
                <span className="mono">ZONE-A</span>
              </div>
            </div>
            <div className={styles.cardContent}>
              <p className={styles.cardDesc}>
                Register a newly arrived engine into its assigned warehouse storage rack and bin.
              </p>
              
              <div className={styles.pendingList}>
                {inTransitEngines.length > 0 ? (
                  inTransitEngines.map((eng) => (
                    <div key={eng.id} className={styles.pendingItem}>
                      <span className={styles.pendingItemCode}>{eng.engine_serial}</span>
                      <span className="badge badge-warning">{eng.variant_code}</span>
                    </div>
                  ))
                ) : (
                  <div className={styles.pendingItem}>
                    <span className={styles.pendingItemStatus}>Queue Empty (No engines in transit)</span>
                  </div>
                )}
              </div>

              <button className={`btn btn-primary ${styles.btnAction}`} onClick={handlePutAway}>
                <ArrowDownToLine size={15} />
                Start Put-Away Scan
              </button>
            </div>
          </div>

          {/* Retrieval Card */}
          <div className={`${styles.cardRetrieval} card-stitch`}>
            <div className={styles.cardHeader}>
              <h2>
                <span className={styles.cardHeaderIcon} style={{ background: 'var(--accent-teal-soft)', color: 'var(--accent-teal)' }}>
                  <ArrowUpFromLine size={16} strokeWidth={2.5} />
                </span>
                Engine Retrieval
              </h2>
              <div className={styles.cardIcon} style={{ color: 'var(--accent-teal)' }}>
                <span className="mono">PICKING</span>
              </div>
            </div>
            <div className={styles.cardContent}>
              <p className={styles.cardDesc}>
                Retrieve a stored engine from its rack location to supply the vehicle assembly line.
              </p>

              <div className={styles.pendingList}>
                {inStorageEngines.length > 0 ? (
                  inStorageEngines.map((eng) => (
                    <div key={eng.id} className={styles.pendingItem}>
                      <span className={styles.pendingItemCode}>{eng.engine_serial}</span>
                      <span className={styles.pendingItemStatus}>Rack {eng.location_code}</span>
                    </div>
                  ))
                ) : (
                  <div className={styles.pendingItem}>
                    <span className={styles.pendingItemStatus}>No engines in storage rack</span>
                  </div>
                )}
              </div>

              <button className={`btn btn-primary ${styles.btnAction}`} style={{ background: 'var(--accent-teal)' }} onClick={handleRetrieval}>
                <ArrowUpFromLine size={15} />
                Start Retrieval Scan
              </button>
            </div>
          </div>

          {/* VIN Verification Bento Card */}
          <div className={`${styles.cardVerify} card-stitch`}>
            <div className={styles.cardHeader}>
              <h2>
                <span className={styles.cardHeaderIcon} style={{ background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)' }}>
                  <ShieldCheck size={16} strokeWidth={2.5} />
                </span>
                Chassis VIN Verification
              </h2>
              <span className="badge badge-info">Double Verification Required</span>
            </div>
            
            <div className={styles.cardContent}>
              <p className={styles.cardDesc}>
                Perform compatibility verification matching. Input the chassis VIN and engine serial to double-check their specifications before shipping out.
              </p>

              <form onSubmit={handleEmbeddedVerifySubmit} className={styles.verifyForm}>
                <div className={styles.formField}>
                  <label htmlFor="embeddedVin">Vehicle VIN</label>
                  <div className={styles.formFieldWithAction}>
                    <input
                      id="embeddedVin"
                      className="input"
                      type="text"
                      value={embeddedVin}
                      onChange={(e) => setEmbeddedVin(e.target.value)}
                      placeholder="Enter 17-char VIN (e.g. VINB6HF...)"
                      required
                    />
                    <button 
                      type="button" 
                      className={styles.scanIconBtn}
                      onClick={() => {
                        setActiveAction('verify');
                        setScanStep(1);
                      }}
                      title="Scan VIN via Camera"
                    >
                      <Camera size={16} />
                    </button>
                  </div>
                </div>

                <div className={styles.formField}>
                  <label htmlFor="embeddedEngine">Engine Serial / QR</label>
                  <div className={styles.formFieldWithAction}>
                    <input
                      id="embeddedEngine"
                      className="input"
                      type="text"
                      value={embeddedEngine}
                      onChange={(e) => setEmbeddedEngine(e.target.value)}
                      placeholder="Enter Serial (e.g. ENG-20260006)"
                      required
                    />
                    <button 
                      type="button" 
                      className={styles.scanIconBtn}
                      onClick={() => {
                        setActiveAction('verify');
                        if (embeddedVin.trim()) {
                          setScanData({ vehicle_vin: embeddedVin.trim() });
                          setScanStep(2);
                        } else {
                          setScanStep(1);
                        }
                      }}
                      title="Scan Engine QR via Camera"
                    >
                      <Camera size={16} />
                    </button>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ background: 'var(--accent-purple)', height: '40px', padding: '0 1.5rem' }}
                  disabled={processing || !embeddedVin.trim() || !embeddedEngine.trim()}
                >
                  <ShieldCheck size={15} />
                  Verify Matching
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Camera Scanner Modal Overlay */}
        {scanStep > 0 && (
          <QRScanner
            onScan={getScanHandler()}
            onClose={resetFlow}
            label={getScanLabel()}
          />
        )}

        {/* Processing Spinner Overlay */}
        {processing && (
          <div className={styles.processingOverlay}>
            <div className={styles.spinner}></div>
            <p className="animate-pulse" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Verifying credentials and logs...</p>
          </div>
        )}

        {/* Verification / Operation Result Modal */}
        {result && (
          <div className={styles.resultOverlay}>
            <div className={`${styles.resultCard} ${result.type === 'match' ? 'verify-match' : ''} ${result.type === 'mismatch' ? 'verify-mismatch' : ''} card-stitch`}>
              {result.type === 'match' && (
                <>
                  <div className={styles.resultIcon} style={{ color: 'var(--status-success)', background: 'var(--status-success-bg)' }}>
                    <CheckCircle size={32} strokeWidth={2} />
                  </div>
                  <h2 style={{ color: 'var(--status-success)' }}>MATCH VERIFIED</h2>
                  <p className={styles.resultMsg}>Ready for assembly line matching</p>
                  <div className={styles.resultDetails}>
                    <div><span>Vehicle VIN:</span> <strong>{result.vehicle_vin}</strong></div>
                    <div><span>Model Name:</span> <strong>{result.vehicle_model}</strong></div>
                    <div><span>Required Variant:</span> <strong>{result.required_variant}</strong></div>
                    <div><span>Engine Serial:</span> <strong>{result.scanned_engine}</strong></div>
                    <div><span>Scanned Variant:</span> <strong>{result.scanned_variant}</strong></div>
                  </div>
                </>
              )}

              {result.type === 'mismatch' && (
                <>
                  <div className={styles.resultIcon} style={{ color: 'var(--status-danger)', background: 'var(--status-danger-bg)' }}>
                    <XCircle size={32} strokeWidth={2} />
                  </div>
                  <h2 style={{ color: 'var(--status-danger)' }}>COMPATIBILITY MISMATCH</h2>
                  <p className={styles.resultMsg} style={{ color: 'var(--status-danger)' }}>An incident has been logged. Do NOT pair.</p>
                  <div className={styles.resultDetails}>
                    <div><span>Vehicle VIN:</span> <strong>{result.vehicle_vin}</strong></div>
                    <div><span>Model Name:</span> <strong>{result.vehicle_model}</strong></div>
                    <div><span>Required Variant:</span> <strong style={{ color: 'var(--status-success)' }}>{result.required_variant}</strong></div>
                    <div><span>Scanned Variant:</span> <strong style={{ color: 'var(--status-danger)' }}>{result.scanned_variant}</strong></div>
                  </div>
                </>
              )}

              {result.type === 'success' && (
                <>
                  <div className={styles.resultIcon} style={{ color: 'var(--status-success)', background: 'var(--status-success-bg)' }}>
                    <Check size={32} strokeWidth={2.5} />
                  </div>
                  <h2 style={{ color: 'var(--status-success)' }}>OPERATION COMPLETED</h2>
                  <p className={styles.resultMsg}>{result.message}</p>
                </>
              )}

              {result.type === 'error' && (
                <>
                  <div className={styles.resultIcon} style={{ color: 'var(--status-danger)', background: 'var(--status-danger-bg)' }}>
                    <AlertCircle size={32} strokeWidth={2} />
                  </div>
                  <h2 style={{ color: 'var(--status-danger)' }}>OPERATION FAILED</h2>
                  <p className={styles.resultMsg}>{result.message}</p>
                </>
              )}

              <button className="btn btn-outline" onClick={resetFlow} style={{ width: '100%' }}>
                Close Result
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
