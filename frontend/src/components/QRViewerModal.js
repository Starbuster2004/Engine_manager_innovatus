'use client';
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { X, Printer } from 'lucide-react';

export default function QRViewerModal({ value, title, onClose }) {
  const qrCanvasRef = useRef(null);
  const barcodeSvgRef = useRef(null);

  const isEngine = value.startsWith('ENGINE-');
  const cleanSerial = isEngine ? value.replace('ENGINE-', '') : value;

  useEffect(() => {
    if (qrCanvasRef.current && value) {
      QRCode.toCanvas(qrCanvasRef.current, value, {
        width: 180,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      }, (err) => {
        if (err) console.error("QR Code error:", err);
      });
    }

    if (barcodeSvgRef.current && isEngine) {
      try {
        JsBarcode(barcodeSvgRef.current, cleanSerial, {
          format: "CODE128",
          width: 2.2,
          height: 60,
          displayValue: true,
          fontSize: 13,
          font: "monospace"
        });
      } catch (err) {
        console.error("Barcode error:", err);
      }
    }
  }, [value, isEngine, cleanSerial]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const qrDataUrl = qrCanvasRef.current ? qrCanvasRef.current.toDataURL() : '';
    const barcodeSvg = barcodeSvgRef.current ? barcodeSvgRef.current.outerHTML : '';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${cleanSerial}</title>
          <style>
            body { font-family: monospace; padding: 20px; text-align: center; color: #000; }
            .label-card { border: 2px dashed #000; padding: 20px; border-radius: 8px; display: inline-block; width: 340px; background: #fff; }
            .label-header { font-size: 16px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 15px; }
            .label-content { display: flex; align-items: center; justify-content: space-around; margin-bottom: 15px; }
            .qr-code img { width: 110px; height: 110px; }
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
            <div class="label-header">ENGINETRACE ${isEngine ? 'ENGINE LABEL' : 'RACK LOC LABEL'}</div>
            <div class="label-content">
              <div class="qr-code"><img src="${qrDataUrl}" /></div>
              <div class="details">
                <strong>CODE:</strong><br/>${cleanSerial}<br/><br/>
                <strong>TYPE:</strong><br/>${isEngine ? 'Automotive Engine' : 'Warehouse Bin'}<br/><br/>
                <strong>GEN DATE:</strong><br/>${new Date().toLocaleDateString()}
              </div>
            </div>
            ${isEngine ? `<div class="barcode">${barcodeSvg}</div>` : ''}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(247, 249, 251, 0.7)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div className="card-stitch" style={{
        width: '100%', maxWidth: '440px', background: 'var(--bg-card)',
        padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: 'var(--shadow-lg)', position: 'relative'
      }}>
        
        {/* Header */}
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px dashed var(--border-default)', paddingBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{title}</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid var(--border-default)',
              width: '28px', height: '28px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem',
              transition: 'var(--transition-fast)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--status-danger)'; e.currentTarget.style.color = 'var(--status-danger)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Label Box */}
        <div style={{
          border: '2px dashed var(--border-hover)', padding: '1.5rem', borderRadius: '10px',
          background: 'white', width: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', borderBottom: '1.5px solid var(--border-default)', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
            <span>ENGINETRACE LABEL</span>
            <span className="mono" style={{ color: 'var(--accent-blue)' }}>{isEngine ? 'ENGINE' : 'LOCATION'}</span>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', justifyContent: 'space-around' }}>
            <canvas ref={qrCanvasRef} style={{ width: '130px', height: '130px' }}></canvas>
            <div style={{ textAlign: 'left', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 600 }}>IDENTIFIER:</span>
                <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 700 }}>{cleanSerial}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 600 }}>FULL QR DATA:</span>
                <div className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', wordBreak: 'break-all', maxWidth: '160px' }}>{value}</div>
              </div>
            </div>
          </div>

          {isEngine && (
            <div style={{ width: '100%', marginTop: '1.25rem', borderTop: '1px dashed var(--border-default)', paddingTop: '1rem', display: 'flex', justifyContent: 'center' }}>
              <svg ref={barcodeSvgRef} style={{ maxWidth: '100%' }}></svg>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handlePrint}>
            <Printer size={15} />
            Print Label
          </button>
        </div>

      </div>
    </div>
  );
}
