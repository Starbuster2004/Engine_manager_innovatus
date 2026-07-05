'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { Wand2, Plus, Printer, Save } from 'lucide-react';

export default function ProductRegister({ currentUserRole }) {
  const [variants, setVariants] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Engine registration states
  const [engineSerial, setEngineSerial] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [mfgDate, setMfgDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedLocation, setSelectedLocation] = useState('');

  // Variant (Product) registration states
  const [variantCode, setVariantCode] = useState('');
  const [variantName, setVariantName] = useState('');
  const [fuelType, setFuelType] = useState('Petrol');
  const [displacement, setDisplacement] = useState(1998);
  const [cylinders, setCylinders] = useState(4);
  const [description, setDescription] = useState('');

  // Generated Label states
  const [labelData, setLabelData] = useState(null); // { serial, qrCode }
  const qrCanvasRef = useRef(null);
  const barcodeSvgRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (labelData) {
      // Generate QR Code
      if (qrCanvasRef.current) {
        QRCode.toCanvas(qrCanvasRef.current, labelData.qrCode, {
          width: 140,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' }
        }, (err) => {
          if (err) console.error("QR Code error:", err);
        });
      }
      // Generate Barcode
      if (barcodeSvgRef.current) {
        try {
          JsBarcode(barcodeSvgRef.current, labelData.serial, {
            format: "CODE128",
            width: 2,
            height: 50,
            displayValue: true,
            fontSize: 12,
            font: "monospace"
          });
        } catch (err) {
          console.error("Barcode error:", err);
        }
      }
    }
  }, [labelData]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vList, lList] = await Promise.all([api.variants(), api.locations()]);
      setVariants(vList);
      setLocations(lList.filter(l => !l.is_occupied));
      if (vList.length > 0) setSelectedVariantId(vList[0].id);
    } catch (err) {
      console.error(err);
      setError('Failed to load variants and rack locations');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSuggestSerial = async () => {
    try {
      const engines = await api.engines();
      if (engines.length === 0) {
        setEngineSerial('ENG-20260001');
        return;
      }
      // Extract numeric suffix from serials like ENG-20260001
      const numericSerials = engines
        .map(e => {
          const match = e.engine_serial.match(/ENG-2026(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

      const maxNum = numericSerials.length > 0 ? Math.max(...numericSerials) : 0;
      const nextNum = maxNum + 1;
      setEngineSerial(`ENG-2026${String(nextNum).padStart(4, '0')}`);
    } catch (err) {
      // Fallback
      setEngineSerial(`ENG-2026${String(Math.floor(1000 + Math.random() * 9000))}`);
    }
  };

  const handleRegisterEngine = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLabelData(null);

    if (!selectedVariantId) {
      setError('Please select a product variant');
      return;
    }

    try {
      const payload = {
        engine_serial: engineSerial.trim().toUpperCase(),
        variant_id: parseInt(selectedVariantId, 10),
        manufacturing_date: mfgDate,
        location_code: selectedLocation || null
      };

      const res = await api.registerEngine(payload);
      setSuccess(`Engine ${engineSerial} registered successfully!`);
      setLabelData({
        serial: engineSerial.trim().toUpperCase(),
        qrCode: res.qr_code || `ENGINE-${engineSerial.trim().toUpperCase()}`,
        variant: variants.find(v => v.id === parseInt(selectedVariantId))?.variant_code || ''
      });

      // Clear input fields
      setEngineSerial('');
      setSelectedLocation('');
      
      // Reload lists
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to register engine');
    }
  };

  const handleRegisterVariant = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const payload = {
        variant_code: variantCode.trim().toUpperCase(),
        variant_name: variantName.trim(),
        fuel_type: fuelType,
        displacement_cc: parseInt(displacement, 10) || 0,
        cylinder_count: parseInt(cylinders, 10) || 0,
        description: description.trim() || null
      };

      await api.registerVariant(payload);
      setSuccess(`Product Variant "${variantCode}" registered successfully!`);
      
      // Reset fields
      setVariantCode('');
      setVariantName('');
      setFuelType('Petrol');
      setDisplacement(1998);
      setCylinders(4);
      setDescription('');

      // Reload so it becomes immediately selectable
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to register product variant');
    }
  };

  const handlePrintLabel = () => {
    if (!labelData) return;
    
    const printWindow = window.open('', '_blank');
    const qrDataUrl = qrCanvasRef.current ? qrCanvasRef.current.toDataURL() : '';
    const barcodeSvg = barcodeSvgRef.current ? barcodeSvgRef.current.outerHTML : '';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${labelData.serial}</title>
          <style>
            body { font-family: monospace; padding: 20px; text-align: center; color: #000; }
            .label-card { border: 2px dashed #000; padding: 20px; border-radius: 8px; display: inline-block; width: 340px; background: #fff; }
            .label-header { font-size: 16px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 15px; }
            .label-content { display: flex; align-items: center; justify-content: space-around; margin-bottom: 15px; }
            .qr-code img { width: 100px; height: 100px; }
            .details { text-align: left; font-size: 11px; }
            .barcode { margin-top: 10px; }
            .barcode svg { width: 100%; height: auto; }
            @media print {
              body { padding: 0; }
              .label-card { border: 2px solid #000; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="label-card">
            <div class="label-header">ENGINETRACE LABEL</div>
            <div class="label-content">
              <div class="qr-code"><img src="${qrDataUrl}" /></div>
              <div class="details">
                <strong>SERIAL:</strong><br/>${labelData.serial}<br/><br/>
                <strong>VARIANT:</strong><br/>${labelData.variant}<br/><br/>
                <strong>DATE:</strong><br/>${new Date().toLocaleDateString()}
              </div>
            </div>
            <div class="barcode">
              ${barcodeSvg}
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="animate-fade" style={{ display: 'grid', gridTemplateColumns: currentUserRole === 'plant_manager' ? '1.2fr 1fr' : '1fr', gap: '2rem' }}>
      
      {/* Left side: Register Engine (both Supervisor and Manager) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="card-stitch" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Engine Production Registration</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Register new engines as they leave the production line. This generates unique QR codes and barcodes for tracking.
          </p>

          {error && <div className="badge badge-danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textTransform: 'none' }}>{error}</div>}
          {success && <div className="badge badge-success" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textTransform: 'none' }}>{success}</div>}

          <form onSubmit={handleRegisterEngine} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Engine Serial Number</label>
                <input
                  className="input"
                  type="text"
                  value={engineSerial}
                  onChange={(e) => setEngineSerial(e.target.value)}
                  placeholder="e.g. ENG-20260051"
                  required
                />
              </div>
              <button type="button" className="btn btn-outline" style={{ height: '38px' }} onClick={handleAutoSuggestSerial}>
                <Wand2 size={14} />
                Auto-Gen
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Product Variant</label>
                <select
                  className="input"
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  style={{ height: '38px' }}
                >
                  {variants.map(v => (
                    <option key={v.id} value={v.id}>{v.variant_code} — {v.variant_name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Manufacturing Date</label>
                <input
                  className="input"
                  type="date"
                  value={mfgDate}
                  onChange={(e) => setMfgDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Initial Warehouse Location (Optional)</label>
              <select
                className="input"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                style={{ height: '38px' }}
              >
                <option value="">-- Remain In Transit / Picking --</option>
                {locations.map(l => (
                  <option key={l.id} value={l.location_code}>Slot {l.location_code} (Zone {l.zone})</option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '40px', marginTop: '0.5rem' }}>
              <Plus size={15} />
              Register Engine & Create Labels
            </button>
          </form>
        </div>

        {/* Label Preview Card */}
        {labelData && (
          <div className="card-stitch animate-fade" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Generated Component Label</h3>
            
            <div style={{ border: '2px dashed var(--border-hover)', padding: '1.5rem', borderRadius: '10px', background: 'white', width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', borderBottom: '1.5px solid var(--border-default)', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                <span>ENGINETRACE LABEL</span>
                <span className="mono">{labelData.variant}</span>
              </div>
              
              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                <canvas ref={qrCanvasRef} style={{ width: '120px', height: '120px' }}></canvas>
                <div style={{ textAlign: 'left', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 600 }}>SERIAL NUMBER:</span>
                    <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 700 }}>{labelData.serial}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 600 }}>VARIANT:</span>
                    <div style={{ fontWeight: 600 }}>{labelData.variant}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 600 }}>MFG DATE:</span>
                    <div>{mfgDate}</div>
                  </div>
                </div>
              </div>
              
              <div style={{ width: '100%', marginTop: '1.25rem', borderTop: '1px dashed var(--border-default)', paddingTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                <svg ref={barcodeSvgRef} style={{ maxWidth: '100%' }}></svg>
              </div>
            </div>

            <button className="btn btn-outline" style={{ marginTop: '1.25rem', width: '100%', maxWidth: '380px' }} onClick={handlePrintLabel}>
              <Printer size={15} />
              Print Barcode & QR Label
            </button>
          </div>
        )}
      </div>

      {/* Right side: Register Variant (Product) - Plant Manager ONLY */}
      {currentUserRole === 'plant_manager' && (
        <div className="card-stitch" style={{ padding: '1.5rem', alignSelf: 'flex-start' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Register New Engine Product</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Create a new automotive engine line. This is registered as a Product Variant and immediately updates all templates.
          </p>

          <form onSubmit={handleRegisterVariant} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Variant Code</label>
              <input
                className="input"
                type="text"
                value={variantCode}
                onChange={(e) => setVariantCode(e.target.value)}
                placeholder="e.g. V8-PET-40"
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Variant Name</label>
              <input
                className="input"
                type="text"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
                placeholder="e.g. V8 Twin Turbo Petrol"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Fuel Type</label>
                <select
                  className="input"
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value)}
                  style={{ height: '38px' }}
                >
                  <option value="Petrol">Petrol</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Electric">Electric</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Cylinder Count</label>
                <input
                  className="input"
                  type="number"
                  value={cylinders}
                  onChange={(e) => setCylinders(e.target.value)}
                  min="0"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Engine Displacement (CC)</label>
              <input
                className="input"
                type="number"
                value={displacement}
                onChange={(e) => setDisplacement(e.target.value)}
                min="0"
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Description</label>
              <textarea
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details about engine specifications..."
                rows="3"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '40px', marginTop: '0.5rem', background: 'var(--accent-purple)' }}>
              <Save size={15} />
              Register Product Variant
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
