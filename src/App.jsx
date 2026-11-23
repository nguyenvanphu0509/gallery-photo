import React, { useEffect, useState, useRef } from 'react';
import { authRequest } from './auth-api.js';
import PhotoImage from './PhotoImage.jsx';
import PhotoEditor from './PhotoEditor.jsx';
import AccountAvatar from './AccountAvatar.jsx';
import Gallery3D from './Gallery3D.jsx';

// Preset stories exactly matching the reference image
const PRESET_STORIES = [
  {
    id: 'preset-1',
    title: 'Design',
    subtitle: 'Chengtao Yi',
    image: '/card-design.webp',
    avatar: '/avatar-1.webp',
    alt: 'Modern cone lamp design by Chengtao Yi',
    date: 'Friday, 10 aug',
    isPreset: true,
  },
  {
    id: 'preset-2',
    title: 'Places',
    subtitle: 'Brooke Holm',
    image: '/card-places.webp',
    avatar: '/avatar-2.webp',
    alt: 'Serene aerial desert dunes by Brooke Holm',
    date: 'Thursday, 9 aug',
    isPreset: true,
  },
  {
    id: 'preset-3',
    title: 'Apogee',
    subtitle: 'John Westrock',
    image: '/card-apogee.webp',
    avatar: '/avatar-3.webp',
    alt: 'Dramatic misty rocky mountains by John Westrock',
    date: 'Wednesday, 8 aug',
    isPreset: true,
  },
  {
    id: 'preset-4',
    title: 'Motion',
    subtitle: 'Mariya Georgieva',
    image: '/card-motion.webp',
    avatar: '/avatar-1.webp',
    alt: 'Expressive neon motion photography by Mariya Georgieva',
    date: 'Tuesday, 7 aug',
    isPreset: true,
  },
  {
    id: 'preset-5',
    title: 'Voyage',
    subtitle: 'Dan Freeman',
    image: '/card-voyage.webp',
    avatar: '/avatar-2.webp',
    alt: 'Golden sunrise over coastal waters by Dan Freeman',
    date: 'Monday, 6 aug',
    isPreset: true,
  },
];

async function apiRequest(url, options) {
  const response = await fetch(url, options);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.message || `Lỗi HTTP ${response.status}`);
  return { status: response.status, body };
}

// Format current real date matching "Friday, 10 aug" style
function getCurrentFormattedDate() {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const day = now.getDate();
  const month = now.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  return `${weekday}, ${day} ${month}`;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [storageStatus, setStorageStatus] = useState('connected');
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [detailPhoto, setDetailPhoto] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [currentDate, setCurrentDate] = useState(getCurrentFormattedDate());
  const [toast, setToast] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewMode, setViewMode] = useState('stories'); // 'stories' | 'gallery'
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [hiddenPresetIds, setHiddenPresetIds] = useState([]);
  const [photoPage, setPhotoPage] = useState(1);
  const [hasMorePhotos, setHasMorePhotos] = useState(false);
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false);

  // Upload Form State
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAlt, setUploadAlt] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Carousel Drag & Scroll ref
  const trackRef = useRef(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragDistanceRef = useRef(0);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const accountMenuRef = useRef(null);
  const avatarBusy = useRef(false);
  const closeEditor = React.useCallback(() => setEditingPhoto(null), []);

  function handleEditSaved(photo, restored) {
    setPhotos(previous => previous.map(item => item.id === photo.id ? photo : item));
    setDetailPhoto(photo);
    setEditingPhoto(null);
    showToast(`${restored ? 'Đã khôi phục bản gốc' : 'Đã lưu chỉnh sửa'} · v${photo.currentVersion}`);
  }

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4000);
  };

  async function refreshPhotos(page = 1) {
    if (page === 1) setLoadingMorePhotos(false);
    try {
      const { body } = await apiRequest(`/api/photos?page=${page}&limit=20`);
      setPhotos(previous => page === 1 ? (body.photos || []) : [...previous, ...(body.photos || [])]);
      setPhotoPage(body.pagination?.page || page);
      setHasMorePhotos(Boolean(body.pagination?.hasMore));
    } catch {
      // Backend may be starting
    }
  }

  useEffect(() => {
    authRequest('/me')
      .then(async ({ user }) => {
        setUser(user);
        if (user) {
          refreshPhotos();
          try {
            const { body } = await apiRequest('/api/presets/hidden');
            setHiddenPresetIds(body.presetIds || []);
          } catch {
            setHiddenPresetIds([]);
          }
        } else {
          setHiddenPresetIds([]);
        }
      })
      .catch(() => {})
      .finally(() => setSessionLoading(false));
    apiRequest('/api/health')
      .then(() => setStorageStatus('connected'))
      .catch(() => setStorageStatus('disconnected'));

    // Update real-time date
    setCurrentDate(getCurrentFormattedDate());
    const dateTimer = setInterval(() => {
      setCurrentDate(getCurrentFormattedDate());
    }, 60000);
    return () => clearInterval(dateTimer);
  }, []);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (accountMenuRef.current?.open && !accountMenuRef.current.contains(event.target)) {
        accountMenuRef.current.open = false;
      }
      if (expandedCardId && !event.target.closest('.story-card.is-expanded')) {
        setExpandedCardId(null);
      }
    }

    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [expandedCardId]);

  async function handleLogout() {
    if (loggingOut || avatarBusy.current) return;
    setLoggingOut(true);
    try {
      await authRequest('/logout', {});
      setUser(null);
      window.location.assign('/login');
    } catch (error) {
      showToast(error.message, true);
    } finally { setLoggingOut(false); }
  }

  function requireLogin(message = 'Vui lòng đăng nhập để sử dụng chức năng này.') {
    if (user) return true;
    showToast(message, true);
    window.location.assign('/login');
    return false;
  }

  async function handleAvatarSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || avatarBusy.current || loggingOut) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Ảnh đại diện tối đa 5 MiB.', true); return; }
    avatarBusy.current = true;
    setAvatarUploading(true);
    try {
      const data = new FormData();
      data.append('avatar', file);
      const result = await authRequest('/avatar', data, { method: 'PUT' });
      setUser(result.user);
      showToast('Đã cập nhật ảnh đại diện.');
    } catch (error) { showToast(error.message, true); }
    finally { avatarBusy.current = false; setAvatarUploading(false); }
  }

  // Keyboard navigation (Escape to collapse card or close modals)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (expandedCardId) setExpandedCardId(null);
        if (showUploadModal) setShowUploadModal(false);
        if (showAboutModal) setShowAboutModal(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedCardId, showUploadModal, showAboutModal]);

  useEffect(() => {
    let cancelled = false;
    setDetailPhoto(null);
    setDetailError('');
    if (!expandedCardId || PRESET_STORIES.some(story => story.id === expandedCardId)) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    apiRequest(`/api/photos/${encodeURIComponent(expandedCardId)}`)
      .then(({ body }) => { if (!cancelled) setDetailPhoto(body.photo); })
      .catch(error => { if (!cancelled) setDetailError(error.message); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [expandedCardId]);

  // Format backend photo into carousel story format
  function formatPhotoStory(photo) {
    const fallback = photo.variants.find(v => v.width >= 960) || photo.variants.at(-1);
    return {
      id: photo.id,
      title: photo.title,
      subtitle: photo.alt.slice(0, 36) + (photo.alt.length > 36 ? '…' : ''),
      alt: photo.alt,
      image: fallback?.url,
      fallback,
      variants: photo.variants,
      date: new Date(photo.createdAt).toLocaleDateString('vi-VN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
      isPreset: false,
      photoData: photo,
    };
  }

  // Combined stories: User's uploaded photos first, then default presets
  const displayStories = [
    ...photos.map(p => formatPhotoStory(p)),
    ...PRESET_STORIES.filter(story => !hiddenPresetIds.includes(story.id)),
  ];

  // Carousel horizontal wheel handler
  const handleWheel = (e) => {
    if (trackRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      trackRef.current.scrollLeft += e.deltaY * 1.4;
    }
  };

  // Carousel Mouse Drag handlers
  const handleMouseDown = (e) => {
    if (!trackRef.current) return;
    isDraggingRef.current = true;
    dragDistanceRef.current = 0;
    startXRef.current = e.pageX - trackRef.current.offsetLeft;
    scrollLeftRef.current = trackRef.current.scrollLeft;
    trackRef.current.classList.add('is-dragging');
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current || !trackRef.current) return;
    e.preventDefault();
    const x = e.pageX - trackRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    dragDistanceRef.current = Math.abs(walk);
    trackRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (trackRef.current) trackRef.current.classList.remove('is-dragging');
  };

  const scrollCarousel = (direction) => {
    if (trackRef.current) {
      trackRef.current.scrollBy({ left: direction * 340, behavior: 'smooth' });
    }
  };

  const loadMorePhotos = async () => {
    if (!hasMorePhotos || loadingMorePhotos) return;
    setLoadingMorePhotos(true);
    try {
      await refreshPhotos(photoPage + 1);
    } finally {
      setLoadingMorePhotos(false);
    }
  };

  // Handle Card Click (toggle horizontal expand in place)
  const handleCardClick = (story, e) => {
    if (dragDistanceRef.current > 8) return;
    if (expandedCardId === story.id) {
      // If clicking inside interactive buttons, do not collapse
      if (
        e.target.closest('.expanded-card-inner')
        || e.target.closest('.card-action-btn')
        || e.target.closest('.card-close-btn')
      ) return;
      setExpandedCardId(null);
    } else {
      setExpandedCardId(story.id);
      // Center the card in the viewport smoothly
      setTimeout(() => {
        const cardElem = document.getElementById(`story-card-${story.id}`);
        if (cardElem && trackRef.current) {
          const containerWidth = trackRef.current.offsetWidth;
          const cardLeft = cardElem.offsetLeft;
          const cardWidth = cardElem.offsetWidth;
          trackRef.current.scrollTo({
            left: cardLeft - (containerWidth / 2) + (cardWidth / 2),
            behavior: 'smooth',
          });
        }
      }, 50);
    }
  };

  // File picker / dropzone handlers
  const handleFilesChosen = (files) => {
    const validFiles = Array.from(files).filter(f =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
    );
    if (!validFiles.length) {
      showToast('Chỉ nhận file ảnh định dạng JPG, PNG hoặc WebP.', true);
      return;
    }
    const combined = [...selectedFiles, ...validFiles].slice(0, 5);
    setSelectedFiles(combined);

    const newPreviews = combined.map(file => ({
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
    }));
    setFilePreviews(newPreviews);
  };

  const removeFile = (index) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    setFilePreviews(filePreviews.filter((_, i) => i !== index));
  };

  // Submit Upload
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFiles.length || selectedFiles.length > 5) {
      showToast('Vui lòng chọn từ 1 đến 5 ảnh.', true);
      return;
    }
    if (!uploadTitle.trim()) {
      showToast('Vui lòng nhập tiêu đề cho ảnh.', true);
      return;
    }

    const formData = new FormData();
    formData.append('title', uploadTitle.trim());
    formData.append('alt', uploadAlt.trim() || uploadTitle.trim());
    selectedFiles.forEach(file => {
      formData.append('photos', file);
    });

    setUploading(true);
    try {
      const { body } = await apiRequest('/api/photos', {
        method: 'POST',
        body: formData,
      });

      const accepted = body.results?.filter(r => r.status === 'accepted') || [];
      if (accepted.length > 0) {
        showToast(`Đã tải lên thành công ${accepted.length} ảnh!`);
        setShowUploadModal(false);
        setUploadTitle('');
        setUploadAlt('');
        setSelectedFiles([]);
        setFilePreviews([]);
        await refreshPhotos();
        if (trackRef.current) {
          trackRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        }
      } else {
        const firstErr = body.results?.[0]?.error?.message || 'Không thể lưu ảnh.';
        showToast(firstErr, true);
      }
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePreset = (presetId) => {
    setDeleteConfirm({ type: 'preset', id: presetId });
  };

  const removePreset = async (presetId) => {
    try {
      const { body } = await apiRequest(`/api/presets/${encodeURIComponent(presetId)}/hidden`, {
        method: 'PUT',
      });
      setHiddenPresetIds(body.presetIds || []);
      setExpandedCardId(null);
      showToast('Đã bỏ thẻ mẫu khỏi gallery.');
    } catch (error) {
      showToast(error.message, true);
    }
  };

  const restorePresets = async (presetIds = null) => {
    const ids = presetIds || hiddenPresetIds;
    try {
      for (const presetId of ids) {
        const { body } = await apiRequest(`/api/presets/${encodeURIComponent(presetId)}/hidden`, {
          method: 'DELETE',
        });
        setHiddenPresetIds(body.presetIds || []);
      }
      showToast(ids.length ? 'Đã khôi phục thẻ mẫu.' : 'Tất cả thẻ mẫu đang hiển thị.');
    } catch (error) {
      showToast(error.message, true);
    }
  };

  // Delete Photo
  const handleDeletePhoto = async (photoId) => {
    setDeleteConfirm({ type: 'photo', id: photoId });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'preset') {
      await removePreset(deleteConfirm.id);
      setDeleteConfirm(null);
      return;
    }
    await removePhoto(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const removePhoto = async (photoId) => {
    setDeleting(true);
    try {
      await apiRequest(`/api/photos/${encodeURIComponent(photoId)}`, {
        method: 'DELETE',
      });
      showToast('Đã xóa ảnh thành công.');
      setExpandedCardId(null);
      await refreshPhotos();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setDeleting(false);
    }
  };

  if (viewMode === 'gallery') {
    return (
      <Gallery3D
        photos={photos}
        user={user}
        onBack={() => setViewMode('stories')}
      />
    );
  }

  return (
    <div className={`app-container${expandedCardId ? ' has-expanded-story' : ''}`}>
      {/* Toast Alert */}
      {toast && (
        <div className={toast.isError ? 'toast-error' : 'toast-notice'} role="alert">
          {toast.message}
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="top-bar">
        <div className="top-left">
          <span className="date-text" title="Ngày thực tế">{currentDate}</span>
          <div className="weather-widget">
            <svg className="weather-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            <span>22°, living room</span>
          </div>
          <span className="storage-status" title={`SeaweedFS ${storageStatus}`}>
            <span className={`status-dot ${storageStatus === 'disconnected' ? 'disconnected' : ''}`} />
            {storageStatus === 'connected' ? 'Storage Ready' : 'Storage Off'}
          </span>
        </div>

        <div className="top-right">
          <nav className="nav-links">
            <button
              type="button"
              className="nav-item active"
            >
              Stories
            </button>
          </nav>
          {sessionLoading ? <span className="account-loading" role="status">Đang tải…</span>
            : user ? <details ref={accountMenuRef} className="account-menu">
              <summary aria-label={`Tài khoản ${user.name}`} title="Mở menu tài khoản"><AccountAvatar user={user} /></summary>
              <div className="account-dropdown">
                <AccountAvatar user={user} large />
                <strong>{user.name}</strong>
                <span>{user.email}</span>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Chọn ảnh đại diện" onChange={handleAvatarSelected} />
                <button type="button" className="avatar-upload-button" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading || loggingOut}>{avatarUploading ? 'Đang tải ảnh…' : user.avatarUrl ? 'Đổi ảnh đại diện' : 'Tải ảnh đại diện'}</button>
                <span className="avatar-upload-hint">JPG, PNG, WebP · tối đa 5 MiB</span>
                {hiddenPresetIds.length > 0 && (
                  <button type="button" onClick={() => restorePresets()}>
                    Khôi phục thẻ mẫu ({hiddenPresetIds.length})
                  </button>
                )}
                <button type="button" onClick={handleLogout} disabled={loggingOut || avatarUploading}>{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
              </div>
            </details>
              : <a className="nav-item login-link" href="/login">Đăng nhập</a>}
          <button className="upload-pill-btn" onClick={() => {
            if (requireLogin()) setShowUploadModal(true);
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Upload</span>
          </button>
        </div>
      </header>

      {/* Stories Floating Carousel Track */}
      <main className="carousel-wrapper">
        <button
          className="nav-arrow left"
          onClick={() => scrollCarousel(-1)}
          aria-label="Previous Stories"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          className="carousel-track"
          ref={trackRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {displayStories.map((listedStory) => {
            const isExpanded = expandedCardId === listedStory.id;
            const story = isExpanded && detailPhoto?.id === listedStory.id ? formatPhotoStory(detailPhoto) : listedStory;
            return (
              <article
                key={story.id}
                id={`story-card-${story.id}`}
                className={`story-card ${isExpanded ? 'is-expanded' : ''}`}
                onClick={(e) => handleCardClick(story, e)}
              >
                {/* Standard / Normal Compact View */}
                {!isExpanded ? (
                  <div className="compact-card-inner">
                    <div className="story-image-wrap">
                      <PhotoImage story={story} />
                      {!story.isPreset ? (
                        <button
                          type="button"
                          className="story-card-delete-btn"
                          disabled={deleting}
                          aria-label={`Xóa ảnh ${story.title}`}
                          title="Xóa ảnh"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeletePhoto(story.id);
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v5M14 11v5" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="story-card-delete-btn"
                          aria-label={`Bỏ thẻ mẫu ${story.title}`}
                          title="Bỏ thẻ mẫu"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeletePreset(story.id);
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v5M14 11v5" />
                          </svg>
                        </button>
                      )}

                      {/* Màng phủ gradient mịn giúp ảnh hòa quyện hoàn toàn với phần trắng tiêu đề, không ranh giới */}
                      <div className="card-top-blend-veil" />

                      {/* Avatar Badge on bottom left of card */}
                      <div className="avatar-badge">
                        {story.avatar ? (
                          <img src={story.avatar} alt="Author" />
                        ) : (
                          <div className="avatar-gradient" />
                        )}
                      </div>

                      {!story.isPreset && <span className="user-tag">User Story</span>}
                    </div>

                    {/* Tiêu đề và tác giả nổi thanh thoát phía trên nền hòa quyện */}
                    <div className="story-card-header">
                      <h3 className="story-title">{story.title}</h3>
                      <p className="story-subtitle">{story.subtitle}</p>
                    </div>
                  </div>
                ) : (
                  /* Expanded In-Place View: Thẻ mở rộng sang 2 bên, hình ảnh hòa quyện cùng nền */
                  <div className="expanded-card-inner">
                    <button
                      className="card-close-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCardId(null);
                      }}
                      title="Thu nhỏ thẻ (Esc)"
                      aria-label="Thu nhỏ"
                    >
                      ✕
                    </button>

                    {/* Left/Visual Section: Ảnh không có viền cứng, hòa quyện với background */}
                    <div className="expanded-visual-section">
                      <PhotoImage story={story} expanded />
                      <div className="expanded-avatar-badge">
                        {story.avatar ? (
                          <img src={story.avatar} alt="Author" />
                        ) : (
                          <div className="avatar-gradient" />
                        )}
                      </div>
                    </div>

                    {/* Right/Details Section */}
                    <div className="expanded-info-section">
                      <div className="expanded-top-info">
                        <span className="expanded-badge-tag">
                          {story.isPreset ? 'Curated Story' : 'User Story'}
                        </span>
                        <h2 className="expanded-main-title">{story.title}</h2>
                        <p className="expanded-author-sub">{story.subtitle}</p>
                        <p className="expanded-description">
                          <strong>Mô tả:</strong> {story.alt}
                        </p>
                        {!story.isPreset && detailLoading && <p className="photo-detail-status" role="status">Đang tải chi tiết ảnh…</p>}
                        {!story.isPreset && detailError && <p className="photo-detail-error" role="alert">{detailError}</p>}
                      </div>

                      <div className="expanded-meta-details">
                        <div className="expanded-date-row">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span>{story.date}</span>
                        </div>

                        {!story.isPreset && story.variants && (
                          <div className="expanded-variants-list">
                            <span className="variants-heading">Các phiên bản ảnh (WebP)</span>
                            <div className="photo-variants-table-wrap">
                              <table className="photo-variants-table">
                                <caption className="sr-only">Kích thước, dung lượng và liên kết từng phiên bản</caption>
                                <thead><tr><th scope="col">Kích thước</th><th scope="col">Dung lượng</th><th scope="col">Ảnh</th></tr></thead>
                                <tbody>{story.variants.map(v => <tr key={v.width}>
                                  <td>{v.width} × {v.height}</td><td>{(v.bytes / 1024).toFixed(1)} KiB</td>
                                  <td><a href={v.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} aria-label={`Mở ảnh ${v.width} × ${v.height}`}>Mở</a></td>
                                </tr>)}</tbody>
                              </table>
                            </div>
                            <details className="photo-technical-details" onClick={event => event.stopPropagation()}>
                              <summary>Thông tin kỹ thuật</summary>
                              <dl><dt>Photo ID</dt><dd>{story.id}</dd><dt>Định dạng</dt><dd>{story.variants[0]?.mime}</dd><dt>Ngày tải lên</dt><dd>{new Date(story.photoData.createdAt).toLocaleString('vi-VN')}</dd></dl>
                              <p>Ảnh trong gallery tải lười (lazy), ảnh chi tiết tải ngay (eager). Cả hai dùng srcset, sizes và kích thước gốc để trình duyệt chọn variant.</p>
                            </details>
                            {!story.photoData.original && <p className="photo-editor-legacy-note">Ảnh cũ chưa lưu bản gốc chuẩn hóa. Tải lại ảnh để dùng công cụ chỉnh sửa.</p>}
                          </div>
                        )}
                      </div>

                      <div className="expanded-bottom-actions">
                        {!story.isPreset && <button type="button" className="card-action-btn edit-btn" disabled={!story.photoData.original || detailLoading || deleting} onClick={event => { event.stopPropagation(); setEditingPhoto(story.photoData); }}>Chỉnh sửa</button>}
                        {!story.isPreset ? (
                          <button
                            className="card-action-btn delete-btn"
                            disabled={deleting}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePhoto(story.id);
                            }}
                          >
                            {deleting ? 'Đang xóa…' : 'Xóa ảnh'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="card-action-btn delete-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeletePreset(story.id);
                            }}
                          >
                            Bỏ thẻ mẫu
                          </button>
                        )}
                        <button
                          className="card-action-btn collapse-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCardId(null);
                          }}
                        >
                          Thu nhỏ
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {/* "+ Add Story" card at the end of track */}
          <div
            className="add-story-card"
            role="button"
            tabIndex={0}
            onClick={() => {
              if (requireLogin()) setShowUploadModal(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (requireLogin()) setShowUploadModal(true);
              }
            }}
          >
            <div className="add-icon-circle">+</div>
            <div className="add-story-text">Add Story</div>
            <div className="add-story-sub">1–5 photos · SeaweedFS</div>
          </div>
          {hasMorePhotos && (
            <button
              type="button"
              className="load-more-stories"
              disabled={loadingMorePhotos}
              onClick={(event) => {
                event.stopPropagation();
                loadMorePhotos();
              }}
            >
              {loadingMorePhotos ? 'Đang tải…' : 'Tải thêm ảnh'}
            </button>
          )}
        </div>

        <button
          className="nav-arrow right"
          onClick={() => scrollCarousel(1)}
          aria-label="Next Stories"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </main>

      {editingPhoto && <PhotoEditor photo={editingPhoto} onClose={closeEditor} onSaved={handleEditSaved} />}

      {/* Interior Furniture Background Scene (Desk, Chair, Plant) */}
      <div className="room-background" aria-hidden="true">
        <img
          src="/desk-scene.webp"
          alt="Modern desk and black chair interior"
          className="furniture-img"
        />
      </div>

      {/* Bottom Left Brand / Category Block -> Click to open Founder Story Popup */}
      <footer
        className="bottom-left-brand clickable-brand"
        onClick={() => setShowAboutModal(true)}
        title="Bấm vào để xem câu chuyện người sáng lập"
      >
        <div className="brand-icon-wrap">
          {/* Thay thế stories-icon.webp thành favicon trực tiếp */}
          <img src="/favicon.svg" alt="Favicon" className="brand-favicon" />
        </div>
        <div className="brand-text">
          <h2>Stories</h2>
          <p>Design, Living, Voyage</p>
        </div>
      </footer>

      {/* Floating 3D Gallery Entry Button */}
      <button
        type="button"
        className="gallery-entry-banner"
        onClick={() => {
          if (requireLogin()) setViewMode('gallery');
        }}
        title="Tham quan không gian Triển lãm 3D Atelier 360°"
      >
        <span style={{ fontSize: '15px' }}>🏛️</span>
        <span>Triển Lãm 3D</span>
        {photos.length > 0 && <span className="gallery-nav-badge">{photos.length} ảnh</span>}
      </button>

      {/* About Founder & Website Story Modal (Nguyễn Văn Phú 2006) */}
      {showAboutModal && (
        <div className="zoom-modal-backdrop" onClick={() => setShowAboutModal(false)}>
          <div
            className="about-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="about-modal-header">
              <div className="about-header-brand">
                <img src="/favicon.svg" alt="Favicon" className="about-favicon-icon" />
                <div>
                  <h3>Habitat Stories</h3>
                  <p>Photo Gallery & Design Architecture</p>
                </div>
              </div>
              <button
                className="zoom-close-btn"
                onClick={() => setShowAboutModal(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            <div className="about-modal-body">
              {/* Founder Profile Card */}
              <div className="founder-card">
                <div className="founder-avatar-wrap">
                  <div className="founder-avatar-initials">NP</div>
                  <span className="founder-year-tag">Gen Z · 2006</span>
                </div>
                <div className="founder-details">
                  <h4 className="founder-name">Nguyễn Văn Phú</h4>
                  <p className="founder-role">Người sáng lập & Nhà phát triển (Creator)</p>
                  <p className="founder-school">
                    🎓 Sinh viên <strong>Trường Đại học Khoa học Tự nhiên</strong> (HCMUS — ĐHQG-HCM)
                  </p>
                </div>
              </div>

              {/* Story & Purpose */}
              <div className="about-story-section">
                <h5 className="story-section-title">Câu Chuyện & Mục Đích Sáng Lập</h5>
                <p className="story-paragraph">
                  Chào mừng bạn đến với <strong>Habitat Stories</strong>! Website được khởi xướng và xây dựng bởi <strong>Nguyễn Văn Phú</strong> với mong muốn kiến tạo một không gian lưu trữ và triển lãm ảnh nghệ thuật mang phong cách kiến trúc tối giản đương đại (Scandinavian Minimalist).
                </p>
                <p className="story-paragraph">
                  Không chỉ đơn thuần là một album ảnh, website được thiết kế như một căn phòng sống động (Living Space) — nơi những khoảnh khắc về <em>Design, Living, Voyage</em> được lơ lửng đầy nghệ thuật trên nền không gian nội thất tĩnh lặng.
                </p>
                <p className="story-paragraph">
                  Mục tiêu công nghệ của dự án là tối ưu trải nghiệm thị giác mượt mà với <strong>React 19 CSR</strong>, hiệu ứng mở rộng thẻ ngang tự nhiên, lưu trữ phân tán <strong>SeaweedFS (S3)</strong> và chuẩn hóa đa biến thể ảnh <strong>WebP Responsive</strong> thông qua Sharp.
                </p>
              </div>

              {/* Tech Highlights */}
              <div className="about-tech-chips">
                <span className="tech-chip">React 19</span>
                <span className="tech-chip">Vite 7</span>
                <span className="tech-chip">Express 5</span>
                <span className="tech-chip">SeaweedFS S3</span>
                <span className="tech-chip">Sharp Engine</span>
                <span className="tech-chip">SQLite WAL</span>
                <span className="tech-chip">HCMUS 2006</span>
              </div>
            </div>

            <div className="about-modal-footer">
              <span className="footer-quote">“Keep little moments, cherish vast spaces.”</span>
              <button
                className="btn-primary"
                onClick={() => setShowAboutModal(false)}
              >
                Tuyệt vời
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Story Modal */}
      {showUploadModal && (
        <div className="zoom-modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div
            className="upload-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="upload-modal-header">
              <h3>Đăng câu chuyện mới</h3>
              <button
                className="zoom-close-btn"
                onClick={() => setShowUploadModal(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            <form className="upload-modal-form" onSubmit={handleUploadSubmit}>
              <div className="form-group">
                <label className="form-label">Tiêu đề ảnh / câu chuyện</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  className="form-input"
                  placeholder="Ví dụ: Design, Places, Bờ biển lúc hoàng hôn…"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mô tả nội dung (Alt text)</label>
                <textarea
                  required
                  maxLength={500}
                  className="form-textarea"
                  placeholder="Mô tả ngắn gọn về khung cảnh hoặc tác giả…"
                  value={uploadAlt}
                  onChange={(e) => setUploadAlt(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Chọn ảnh (1 đến 5 ảnh JPEG, PNG, WebP)</label>
                <div
                  className={`dropzone-area ${isDragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files) handleFilesChosen(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files && handleFilesChosen(e.target.files)}
                  />
                  <div className="dropzone-content">
                    <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="dropzone-text">Bấm để chọn hoặc kéo thả ảnh vào đây</span>
                    <span className="dropzone-hint">Tối đa 5 file, mỗi file tối đa 10 MiB</span>
                  </div>
                </div>

                {/* Previews */}
                {filePreviews.length > 0 && (
                  <div className="file-previews">
                    {filePreviews.map((preview, i) => (
                      <div key={i} className="file-preview-card" title={`${preview.name} (${preview.size})`}>
                        <img src={preview.url} alt="Preview" />
                        <button
                          type="button"
                          className="file-remove-btn"
                          onClick={() => removeFile(i)}
                          aria-label="Xóa ảnh này"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowUploadModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={uploading || !selectedFiles.length}
                >
                  {uploading ? 'Đang xử lý & lưu…' : `Tải lên (${selectedFiles.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="delete-confirm-backdrop" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="delete-confirm-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v5M14 11v5" />
              </svg>
            </div>
            <h2 id="delete-confirm-title">
              {deleteConfirm.type === 'preset' ? 'Bỏ thẻ mẫu này?' : 'Xóa ảnh này?'}
            </h2>
            <p>
              {deleteConfirm.type === 'preset'
                ? 'Thẻ mẫu sẽ được bỏ khỏi gallery trên thiết bị này.'
                : 'Ảnh và các phiên bản sẽ được dọn khỏi hệ thống.'}
            </p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-confirm-cancel"
                disabled={deleting}
                onClick={() => setDeleteConfirm(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="delete-confirm-submit"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? 'Đang xóa…' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
