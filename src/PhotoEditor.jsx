import React, { useCallback, useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { drawEditPreview, originalCropFromArea } from './editor-geometry.js';
import './photo-editor.css';

export default function PhotoEditor({ photo, onClose, onSaved }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratio, setRatio] = useState('original');
  const [area, setArea] = useState(null);
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const canvasRef = useRef(null);
  const dialogRef = useRef(null);
  const { width, height, url } = photo.original;
  const pixelCrop = originalCropFromArea(area, width, height, rotation, flipped);
  const aspect = ratio === 'original' ? (rotation % 180 ? height / width : width / height) : Number(ratio);

  const areaChanged = useCallback((_, next) => setArea(previous => previous && ['x', 'y', 'width', 'height'].every(key => previous[key] === next[key]) ? previous : next), []);

  useEffect(() => {
    const source = new Image();
    let cancelled = false;
    source.onload = () => { if (!cancelled) setImage(source); };
    source.onerror = () => { if (!cancelled) setError('Không tải được bản gốc. Kiểm tra kết nối kho ảnh rồi mở lại trình sửa.'); };
    source.src = url;
    return () => { cancelled = true; source.onload = null; source.onerror = null; };
  }, [url]);

  useEffect(() => {
    if (image && pixelCrop && canvasRef.current) drawEditPreview(canvasRef.current, image, pixelCrop, rotation, flipped);
  }, [image, area, rotation, flipped, width, height]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!busy.current) onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); previousFocus?.focus(); };
  }, [onClose]);

  function reset() {
    setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); setFlipped(false); setRatio('original'); setArea({ x: 0, y: 0, width, height }); setError('');
  }
  function rotate() {
    setArea(null); setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(value => (value + 90) % 360);
  }

  async function save(restore = false) {
    if (busy.current || (!restore && (!pixelCrop || !image))) return;
    busy.current = true; setPending(true); setError('');
    try {
      const response = await fetch(`/api/photos/${encodeURIComponent(photo.id)}/${restore ? 'restore' : 'edit'}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: photo.currentVersion, ...(restore ? {} : { crop: pixelCrop, rotation, flip: flipped }) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'Không lưu được ảnh. Vui lòng thử lại.');
      onSaved(result.photo, restore);
    } catch (failure) {
      setError(failure.message === 'Failed to fetch' ? 'Không kết nối được máy chủ. Vui lòng thử lại.' : failure.message);
    } finally { busy.current = false; setPending(false); }
  }

  return <div className="photo-editor-overlay">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="photo-editor-title" className="photo-editor" aria-busy={pending}>
      <header className="photo-editor-header">
        <div><p className="photo-editor-eyebrow">HABITAT STUDIO</p><h2 id="photo-editor-title">Chỉnh sửa ảnh</h2><p className="photo-editor-subtitle">{photo.title} · Bản gốc {width} × {height} · Phiên bản v{photo.currentVersion}</p></div>
        <button type="button" className="photo-editor-close" disabled={pending} onClick={onClose} aria-label="Đóng trình chỉnh sửa">✕</button>
      </header>
      <div className="photo-editor-body">
        <div className="photo-editor-workspace">
          <div className={`photo-editor-cropper${pending ? ' is-pending' : ''}`}>
            <Cropper image={url} crop={crop} zoom={zoom} rotation={rotation} aspect={aspect}
              cropShape="rect" showGrid restrictPosition roundCropAreaPixels
              transform={`translate(${crop.x}px, ${crop.y}px) scaleX(${flipped ? -1 : 1}) rotate(${rotation}deg) scale(${zoom})`}
              onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={areaChanged} onCropAreaChange={areaChanged}
              mediaProps={{ alt: `Chọn vùng cắt cho ${photo.alt}` }} />
          </div>
          <p className="photo-editor-help">Kéo ảnh để chọn vùng cắt. Cuộn hoặc dùng thanh thu phóng để căn chỉnh.</p>
          <fieldset disabled={pending} className="photo-editor-controls">
            <div className="photo-editor-tools">
              <button type="button" onClick={rotate}>Xoay 90° <span>{rotation}°</span></button>
              <button type="button" aria-pressed={flipped} className={flipped ? 'is-active' : ''} onClick={() => setFlipped(value => !value)}>Lật ngang</button>
              <button type="button" onClick={reset}>Đặt lại thao tác</button>
            </div>
            <label className="photo-editor-zoom">Thu phóng <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => setZoom(Number(event.target.value))} /><output>{zoom.toFixed(2)}×</output></label>
            <label className="photo-editor-ratio">Tỷ lệ vùng cắt<select value={ratio} onChange={event => { setArea(null); setRatio(event.target.value); setCrop({ x: 0, y: 0 }); setZoom(1); }}><option value="original">Theo bản gốc</option><option value="1">Vuông 1:1</option><option value={4 / 3}>Ngang 4:3</option><option value={16 / 9}>Ngang 16:9</option><option value={3 / 4}>Dọc 3:4</option></select></label>
          </fieldset>
        </div>
        <aside className="photo-editor-preview-panel" aria-label="Xem trước kết quả chỉnh sửa">
          <h3>Xem trước kết quả</h3>
          <div className="photo-editor-preview">{!image && <p>Đang tải bản gốc…</p>}<canvas ref={canvasRef} hidden={!image || !pixelCrop} aria-label="Ảnh sau khi cắt, xoay và lật" role="img" /></div>
          <p className="photo-editor-note">Mỗi lần chỉnh sửa dùng bản gốc đã chuẩn hóa để giữ chất lượng. Lưu sẽ tạo phiên bản mới của ảnh.</p>
          {pixelCrop && <details className="photo-editor-pixels"><summary>Thông số vùng cắt</summary><p>Trên bản gốc: x = {pixelCrop.x}, y = {pixelCrop.y}<br />Kích thước: {pixelCrop.width} × {pixelCrop.height} px<br />Xoay: {rotation}° · Lật ngang: {flipped ? 'Có' : 'Không'}</p></details>}
          <button type="button" className="photo-editor-restore" disabled={pending || !image} onClick={() => save(true)}>Khôi phục bản gốc</button>
        </aside>
      </div>
      {error && <p className="photo-editor-error" role="alert">{error}</p>}
      <footer className="photo-editor-footer"><button type="button" className="photo-editor-cancel" disabled={pending} onClick={onClose}>Hủy</button><button type="button" className="photo-editor-save" disabled={pending || !image || !pixelCrop} onClick={() => save()}>{pending ? 'Đang lưu…' : 'Lưu phiên bản mới'}</button></footer>
    </section>
  </div>;
}
