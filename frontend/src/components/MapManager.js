'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import QRCode from 'qrcode';
import { Plus, Printer, Save, Trash2, CheckSquare } from 'lucide-react';

export default function MapManager({ currentUserRole }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Selected slot details & editing
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [editZone, setEditZone] = useState('');
  const [isOccupiedToggle, setIsOccupiedToggle] = useState(false);

  const qrCanvasRef = useRef(null);

  useEffect(() => {
    if (selectedLoc && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, selectedLoc.qr_code, {
        width: 120,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      }, (err) => {
        if (err) console.error("QR Code error inside MapManager:", err);
      });
    }
  }, [selectedLoc]);

  const handlePrintRackLabel = () => {
    if (!selectedLoc) return;
    const printWindow = window.open('', '_blank');
    const qrDataUrl = qrCanvasRef.current ? qrCanvasRef.current.toDataURL() : '';
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${selectedLoc.location_code}</title>
          <style>
            body { font-family: monospace; padding: 20px; text-align: center; color: #000; }
            .label-card { border: 2px dashed #000; padding: 20px; border-radius: 8px; display: inline-block; width: 260px; background: #fff; }
            .label-header { font-size: 14px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 15px; }
            .qr-code img { width: 130px; height: 130px; }
            .details { margin-top: 10px; font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="label-card">
            <div class="label-header">ENGINETRACE RACK LOC</div>
            <div class="qr-code"><img src="${qrDataUrl}" /></div>
            <div class="details">BIN SLOT: ${selectedLoc.location_code}</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // New location form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newZone, setNewZone] = useState('A');
  const [newRack, setNewRack] = useState(1);
  const [newShelf, setNewShelf] = useState(1);
  const [newPosition, setNewPosition] = useState(1);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.locations();
      setLocations(data);
    } catch (err) {
      setError(err.message || 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSlot = (loc) => {
    setError('');
    setSuccess('');
    setSelectedLoc(loc);
    setEditZone(loc.zone);
    setIsOccupiedToggle(!!loc.is_occupied);
  };

  const handleUpdateLocation = async (e) => {
    e.preventDefault();
    if (!selectedLoc) return;
    setError('');
    setSuccess('');

    try {
      const payload = {
        zone: editZone.trim().toUpperCase(),
        is_occupied: isOccupiedToggle
      };

      await api.updateLocation(selectedLoc.id, payload);
      setSuccess(`Location ${selectedLoc.location_code} updated successfully!`);
      setSelectedLoc(null);
      loadLocations();
    } catch (err) {
      setError(err.message || 'Failed to update location');
    }
  };

  const handleDeleteLocation = async () => {
    if (!selectedLoc) return;
    if (selectedLoc.is_occupied) {
      setError('Cannot delete an occupied slot. Clear its contents first.');
      return;
    }
    if (!confirm(`Are you sure you want to delete slot "${selectedLoc.location_code}" from the map?`)) return;

    setError('');
    setSuccess('');
    try {
      await api.deleteLocation(selectedLoc.id);
      setSuccess(`Location ${selectedLoc.location_code} deleted successfully.`);
      setSelectedLoc(null);
      loadLocations();
    } catch (err) {
      setError(err.message || 'Failed to delete location');
    }
  };

  const handleCreateLocation = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const pad = (num) => String(num).padStart(2, '0');
    const locationCode = `R${pad(newRack)}-S${pad(newShelf)}-P${pad(newPosition)}`;

    try {
      const payload = {
        location_code: locationCode,
        rack_number: parseInt(newRack, 10),
        shelf_number: parseInt(newShelf, 10),
        position_number: parseInt(newPosition, 10),
        zone: newZone.trim().toUpperCase()
      };

      await api.createLocation(payload);
      setSuccess(`Location ${locationCode} created successfully!`);
      setShowAddForm(false);
      loadLocations();
    } catch (err) {
      setError(err.message || 'Failed to create location');
    }
  };

  // Group locations by zone for rendering
  const zones = [...new Set(locations.map(l => l.zone))].sort();

  return (
    <div className="animate-fade" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
      
      {/* Left Column: Warehouse Map Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Warehouse Rack Map</h2>
          <button 
            className="btn btn-outline" 
            onClick={() => {
              setShowAddForm(!showAddForm);
              setSelectedLoc(null);
              setError('');
              setSuccess('');
            }}
          >
            {showAddForm ? 'Cancel' : <><Plus size={14} /> Create Rack Slot</>}
          </button>
        </div>

        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading layout...</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {zones.map((zone) => {
            const zoneSlots = locations.filter(l => l.zone === zone);
            return (
              <div 
                key={zone} 
                className="card-stitch" 
                style={{ 
                  padding: '1.25rem', 
                  background: 'var(--bg-card)', 
                  border: selectedLoc?.zone === zone ? '1px solid var(--accent-blue)' : '1px solid var(--border-default)' 
                }}
              >
                <h3 style={{ fontSize: '0.925rem', fontWeight: 700, marginBottom: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Zone {zone} (Rack {zoneSlots[0]?.rack_number || '-'})</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {zoneSlots.filter(s => s.is_occupied).length}/{zoneSlots.length} Occupied
                  </span>
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
                  {zoneSlots.map((loc) => {
                    const isSelected = selectedLoc?.id === loc.id;
                    let bg = '#ecfdf5'; // green (available)
                    let border = '1px solid #10b981';
                    let color = '#047857';
                    
                    if (loc.is_occupied) {
                      bg = '#fef2f2'; // red (occupied)
                      border = '1px solid #f87171';
                      color = '#b91c1c';
                    }
                    if (isSelected) {
                      border = '2.5px solid var(--accent-blue)';
                    }

                    return (
                      <button
                        key={loc.id}
                        onClick={() => handleSelectSlot(loc)}
                        style={{
                          background: bg,
                          border: border,
                          color: color,
                          borderRadius: '6px',
                          height: '34px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          transition: 'var(--transition-fast)',
                          transform: isSelected ? 'scale(1.05)' : 'none',
                          boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                        }}
                        title={`${loc.location_code} ${loc.engine_serial ? `(${loc.engine_serial})` : '(Available)'}`}
                      >
                        {loc.position_number}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '1.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fef2f2', border: '1px solid #f87171' }}></span>
            Occupied Rack Slot
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ecfdf5', border: '1px solid #10b981' }}></span>
            Available Rack Slot
          </span>
        </div>
      </div>

      {/* Right Column: Actions Sidebar (Create / Edit Panel) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignSelf: 'flex-start' }}>
        
        {error && <div className="badge badge-danger" style={{ width: '100%', padding: '0.75rem', display: 'block', textTransform: 'none' }}>{error}</div>}
        {success && <div className="badge badge-success" style={{ width: '100%', padding: '0.75rem', display: 'block', textTransform: 'none' }}>{success}</div>}

        {/* Add Location Form */}
        {showAddForm && (
          <div className="card-stitch animate-fade" style={{ padding: '1.5rem', background: 'var(--bg-secondary)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Create Warehouse Rack Slot</h3>
            <form onSubmit={handleCreateLocation} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Zone</label>
                <input
                  className="input"
                  type="text"
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  placeholder="e.g. A"
                  maxLength="2"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Rack No.</label>
                  <input
                    className="input"
                    type="number"
                    value={newRack}
                    onChange={(e) => setNewRack(e.target.value)}
                    min="1"
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Shelf No.</label>
                  <input
                    className="input"
                    type="number"
                    value={newShelf}
                    onChange={(e) => setNewShelf(e.target.value)}
                    min="1"
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Pos No.</label>
                  <input
                    className="input"
                    type="number"
                    value={newPosition}
                    onChange={(e) => setNewPosition(e.target.value)}
                    min="1"
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '38px', marginTop: '0.5rem' }}>
                <Save size={14} /> Save Rack Slot
              </button>
            </form>
          </div>
        )}

        {/* Selected Slot Details & Edit form */}
        {selectedLoc ? (
          <div className="card-stitch animate-fade" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>
              Rack Slot {selectedLoc.location_code}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', fontSize: '0.825rem', alignItems: 'center' }}>
              <canvas ref={qrCanvasRef} style={{ width: '120px', height: '120px', marginBottom: '0.5rem', border: '1px dashed var(--border-default)', borderRadius: '6px', background: 'white' }}></canvas>
              
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={handlePrintRackLabel}
                style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
              >
                <Printer size={13} /> Print Slot Label
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ color: 'var(--text-muted)' }}>Location QR:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{selectedLoc.qr_code}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                <span className={`badge ${selectedLoc.is_occupied ? 'badge-danger' : 'badge-success'}`}>
                  {selectedLoc.is_occupied ? 'Occupied' : 'Available'}
                </span>
              </div>
              {selectedLoc.engine_serial && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Engine Stored:</span>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{selectedLoc.engine_serial}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Engine Variant:</span>
                    <span style={{ fontWeight: 600 }}>{selectedLoc.variant_code}</span>
                  </div>
                </>
              )}
            </div>

            <form onSubmit={handleUpdateLocation} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px dashed var(--border-default)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Modify Zone</label>
                <input
                  className="input"
                  type="text"
                  value={editZone}
                  onChange={(e) => setEditZone(e.target.value)}
                  maxLength="2"
                  required
                />
              </div>

              {!selectedLoc.engine_serial && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0' }}>
                  <input
                    type="checkbox"
                    id="isOccupiedToggle"
                    checked={isOccupiedToggle}
                    onChange={(e) => setIsOccupiedToggle(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <label htmlFor="isOccupiedToggle" style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    Force Mark Occupied (Override)
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-success" style={{ flex: 1, height: '38px' }}>
                  <CheckSquare size={14} /> Apply Changes
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  style={{ flex: 1, height: '38px' }}
                  disabled={selectedLoc.is_occupied}
                  onClick={handleDeleteLocation}
                  title={selectedLoc.is_occupied ? 'Cannot delete occupied slot' : 'Delete slot'}
                >
                  <Trash2 size={14} /> Delete Slot
                </button>
              </div>
            </form>
          </div>
        ) : (
          !showAddForm && (
            <div className="card-stitch" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Select a warehouse slot on the map to modify its settings or view full occupancy details.
            </div>
          )
        )}
      </div>

    </div>
  );
}
