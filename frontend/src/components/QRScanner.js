'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, Keyboard, Send } from 'lucide-react';
import styles from './QRScanner.module.css';

export default function QRScanner({ onScan, onClose, label = 'Scan QR Code' }) {
  const scannerRef = useRef(null);
  const instanceRef = useRef(null);
  const cancelRequestedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [mode, setMode] = useState('camera'); // 'camera' | 'manual'

  // Keep callback refs up to date without causing effect re-runs
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Safe cleanup helper — waits for pending play() to settle
  const safeCleanup = useCallback(async (scanner) => {
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        // Give pending play() promises a tick to settle
        await new Promise(r => setTimeout(r, 50));
        await scanner.stop();
      }
    } catch (e) {
      // Specifically ignore AbortError from interrupted play()
      if (e.name !== 'AbortError') {
        console.log('Scanner cleanup:', e.message);
      }
    }
    try { scanner.clear(); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (mode !== 'camera') return;

    let scanner = null;
    let isMounted = true;
    cancelRequestedRef.current = false;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!isMounted || cancelRequestedRef.current) return;
        
        // Clean up any leftover scanner
        if (instanceRef.current) {
          await safeCleanup(instanceRef.current);
          instanceRef.current = null;
        }

        scanner = new Html5Qrcode('qr-reader');
        instanceRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (isMounted && !cancelRequestedRef.current) {
              // Stop camera before passing results
              safeCleanup(scanner).finally(() => {
                onScanRef.current(decodedText);
              });
            }
          },
          () => {} // ignore errors during scanning
        );

        // If cancelled/unmounted while camera was starting
        if (!isMounted || cancelRequestedRef.current) {
          await safeCleanup(scanner);
        }
      } catch (err) {
        // Ignore AbortError specifically
        if (err.name === 'AbortError') return;
        if (isMounted && !cancelRequestedRef.current) {
          setError('Camera not available. Switching to manual entry.');
          setMode('manual');
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      const activeScanner = instanceRef.current;
      if (activeScanner) {
        safeCleanup(activeScanner);
        instanceRef.current = null;
      }
    };
  }, [mode, safeCleanup]); // onScan removed — using ref instead

  const handleCancel = async () => {
    cancelRequestedRef.current = true;
    const activeScanner = instanceRef.current;
    if (activeScanner) {
      await safeCleanup(activeScanner);
      instanceRef.current = null;
    }
    onCloseRef.current();
  };

  const handleSwitchToManual = async () => {
    const activeScanner = instanceRef.current;
    if (activeScanner) {
      await safeCleanup(activeScanner);
      instanceRef.current = null;
    }
    setMode('manual');
  };

  const handleSwitchToCamera = () => {
    cancelRequestedRef.current = false;
    setError('');
    setMode('camera');
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) onScanRef.current(manualInput.trim());
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>{label}</h3>
          <button className={styles.closeBtn} onClick={handleCancel} aria-label="Close scanner">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${mode === 'camera' ? styles.active : ''}`} onClick={handleSwitchToCamera}>
            <Camera size={14} />
            Camera
          </button>
          <button className={`${styles.tab} ${mode === 'manual' ? styles.active : ''}`} onClick={handleSwitchToManual}>
            <Keyboard size={14} />
            Manual Entry
          </button>
        </div>

        {mode === 'camera' && (
          <div className={styles.scannerArea}>
            <div className={styles.readerContainer}>
              <div id="qr-reader" ref={scannerRef} className={styles.reader}></div>
              <div className={styles.scanOverlay}>
                <div className={styles.scanCorner} style={{ top: 0, left: 0 }}></div>
                <div className={styles.scanCorner} style={{ top: 0, right: 0, transform: 'scaleX(-1)' }}></div>
                <div className={styles.scanCorner} style={{ bottom: 0, left: 0, transform: 'scaleY(-1)' }}></div>
                <div className={styles.scanCorner} style={{ bottom: 0, right: 0, transform: 'scale(-1)' }}></div>
              </div>
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button className="btn btn-outline" onClick={handleCancel} style={{ width: '100%', marginTop: '1.25rem' }}>
              Cancel
            </button>
          </div>
        )}

        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} className={styles.manualForm}>
            <p className={styles.hint}>Enter the barcode value manually (e.g., ENGINE-ENG-20260001 or LOC-R01-S01-P01)</p>
            <input
              className="input"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Enter details..."
              autoFocus
            />
            <div className={styles.btnRow}>
              <button type="button" className="btn btn-outline" onClick={handleCancel} style={{ flex: 1 }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={!manualInput.trim()}>
                <Send size={14} />
                Submit
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
