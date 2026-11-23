import React, { useEffect, useRef, useState } from 'react';
import { authRequest } from './auth-api.js';
import './auth.css';

const SLIDES = [
  { image: '/1.jpeg', category: 'Art', alt: 'Bức tranh đôi bàn tay trong khung vàng trên tường bảo tàng màu xanh đậm', title: 'Mỗi tác phẩm,\nmột câu chuyện.', description: 'Dừng lại trước những điều đẹp đẽ. Tìm cảm hứng theo cách của bạn.' },
  { image: '/2.jpeg', category: 'Gallery', alt: 'Chân dung người phụ nữ với trang phục cầu kỳ trong phòng triển lãm đầy ánh sáng', title: 'Một không gian,\nngàn cảm hứng.', description: 'Khám phá vẻ đẹp qua từng đường nét và những góc nhìn mới.' },
  { image: '/3.jpeg', category: 'Perspectives', alt: 'Chín bức ảnh biển và sóng được đóng khung trên tường triển lãm', title: 'Những góc nhìn,\nnhững điều giản đơn.', description: 'Một khung hình nhỏ có thể mở ra cả một chân trời.' },
  { image: '/4.jpeg', category: 'Moments', alt: 'Người xem đứng trước những bức ảnh đen trắng trong phòng triển lãm', title: 'Giữ lại khoảnh khắc.\nKể lại cảm xúc.', description: 'Để những điều chạm đến bạn luôn ở lại trong từng câu chuyện.' },
];

function SocialIcon({ provider }) {
  if (provider === 'Google') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.06a10 10 0 0 0 0 9.04l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.88-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.59c.8-2.36 3-4.12 5.6-4.12Z"/></svg>;
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{provider === 'Apple'
    ? <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.4c.59-.72.99-1.72.88-2.72-.85.03-1.89.57-2.5 1.28-.55.63-.99 1.66-.86 2.63.95.07 1.89-.47 2.48-1.19z"/>
    : <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>}</svg>;
}

export default function AuthPage({ initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const signup = mode === 'signup';
  const forgot = mode === 'forgot';
  const heading = forgot ? 'Quên mật khẩu?' : signup ? 'Bắt đầu câu chuyện của bạn.' : 'Chào mừng trở lại.';
  const slide = SLIDES[slideIndex];

  useEffect(() => {
    document.title = `${forgot ? 'Quên mật khẩu' : signup ? 'Đăng ký' : 'Đăng nhập'} · Habitat Stories`;
  }, [forgot, signup]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setSlideIndex(index => (index + 1) % SLIDES.length), 6000);
    return () => clearInterval(timer);
  }, [paused]);

  function switchMode(next) {
    if (busy.current) return;
    setMode(next);
    setMessage('');
    setShowPassword(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    setMessage('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (signup && fields.get('password') !== fields.get('confirmPassword')) {
      setMessage('Mật khẩu nhập lại chưa khớp. Vui lòng kiểm tra lại.');
      return;
    }
    if (forgot) {
      setMessage('Khôi phục mật khẩu qua email hiện chưa khả dụng. Vui lòng quay lại đăng nhập.');
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      await authRequest(signup ? '/register' : '/login', {
        email: fields.get('email').trim(),
        password: fields.get('password'),
        ...(signup ? { name: fields.get('name').trim(), confirmPassword: fields.get('confirmPassword') }
          : { remember: fields.get('remember') === 'on' }),
      });
      form.reset();
      window.location.assign('/');
    } catch (error) {
      setMessage(error.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-form-column" aria-labelledby="auth-heading">
          <a className="auth-brand" href="/" aria-label="Habitat Stories — Trang chủ">
            <img src="/favicon.svg" width="44" height="44" alt="" />
            <span>Habitat<span className="auth-brand-caption">STORIES & LITTLE MOMENTS</span></span>
          </a>
          <div className="auth-mode-switch" aria-label="Lựa chọn tài khoản">
            <button type="button" disabled={pending} className={signup ? 'selected' : ''} aria-pressed={signup} onClick={() => switchMode('signup')}>Đăng ký</button>
            <button type="button" disabled={pending} className={!signup && !forgot ? 'selected' : ''} aria-pressed={!signup && !forgot} onClick={() => switchMode('login')}>Đăng nhập</button>
          </div>
          <div className="auth-intro">
            <h1 id="auth-heading">{heading}</h1>
            <p>{forgot ? 'Nhập email để tìm lại tài khoản của bạn.' : 'Một không gian nhỏ cho những cảm hứng lớn.'}</p>
          </div>
          {!forgot && <>
            <div className="auth-socials">
              {['Apple', 'Google', 'X'].map(provider => <button key={provider} type="button" disabled={pending} aria-label={`Tiếp tục với ${provider}`} onClick={() => setMessage(`Đăng nhập bằng ${provider} hiện chưa được cấu hình. Vui lòng đăng nhập bằng email và mật khẩu.`)}><SocialIcon provider={provider} /></button>)}
            </div>
            <div className="auth-separator"><span>hoặc tiếp tục với email</span></div>
          </>}
          <form key={mode} className="auth-form" onSubmit={handleSubmit} aria-busy={pending}>
            <fieldset className="auth-form-fields" disabled={pending}>
            {signup && <div className="auth-input-field"><label htmlFor="auth-name">Tên của bạn</label><input id="auth-name" name="name" autoComplete="name" placeholder="Bạn muốn được gọi là gì?" maxLength={100} required /></div>}
            <div className="auth-input-field">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" name="email" type="email" autoComplete="email" placeholder="ban@example.com" maxLength={254} required />
            </div>
            {!forgot && <>
              <div className="auth-input-field">
                <label htmlFor="auth-password">Mật khẩu</label>
                <div className="auth-password-field">
                  <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'Tối thiểu 15 ký tự' : 'Nhập mật khẩu của bạn'} minLength={signup ? 15 : undefined} maxLength={128} required />
                  <button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{!showPassword && <path d="m3 3 18 18"/>}</svg>
                  </button>
                </div>
              </div>
              {signup ? <div className="auth-input-field"><label htmlFor="auth-confirm">Nhập lại mật khẩu</label><input id="auth-confirm" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Nhập lại mật khẩu của bạn" minLength={15} maxLength={128} required /></div>
                : <div className="auth-options"><label><input type="checkbox" name="remember" defaultChecked />Ghi nhớ đăng nhập</label><button type="button" onClick={() => switchMode('forgot')}>Quên mật khẩu?</button></div>}
            </>}
            </fieldset>
            {message && <p className="auth-feedback" role="alert">{message}</p>}
            <button className="auth-submit" disabled={pending} type="submit">{pending ? (signup ? 'Đang tạo tài khoản…' : 'Đang đăng nhập…') : forgot ? 'Gửi liên kết khôi phục' : signup ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
          </form>
          <p className="auth-bottom-text">{forgot ? <button type="button" disabled={pending} onClick={() => switchMode('login')}>Quay lại đăng nhập</button> : <>{signup ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}<button type="button" disabled={pending} onClick={() => switchMode(signup ? 'login' : 'signup')}>{signup ? 'Đăng nhập' : 'Đăng ký ngay'}</button></>}</p>
          <a className="auth-home-link" href="/">Về không gian Stories</a>
        </section>
        <section className="auth-visual" aria-label="Cảm hứng từ Stories">
          {SLIDES.map((item, index) => <img key={item.image} className={`auth-scene ${index === slideIndex ? 'is-visible' : ''}`} src={item.image} alt={index === slideIndex ? item.alt : ''} aria-hidden={index !== slideIndex} />)}
        </section>
      </div>
      <footer className="auth-page-footer"><span>Habitat Stories</span><span>Những điều nhỏ bé. Những câu chuyện của riêng bạn.</span></footer>
    </main>
  );
}
