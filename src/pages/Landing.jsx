/**
 * Landing — public marketing site shown to unauthenticated visitors at `/`.
 *
 * The site itself is a static HTML/CSS/JS template that lives in
 * `public/landing/`. We render it inside a full-viewport iframe so we can
 * keep the rich animations + 3D mockups without porting 900 lines of JSX.
 * A small bridge script inside the template postMessages SPA-bound
 * navigations (`/login`, `/register`) back here so we use react-router
 * instead of triggering a hard reload.
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();
  const frameRef = useRef(null);

  useEffect(() => {
    const onMsg = (e) => {
      const data = e.data || {};
      if (data.type === 'ledgr:navigate' && typeof data.to === 'string') {
        navigate(data.to);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [navigate]);

  return (
    <iframe
      ref={frameRef}
      src="/landing/index.html"
      title="LedgrPro"
      // Fills the whole viewport, no chrome, no scrollbars added by the
      // outer SPA shell.
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        border: 0,
        margin: 0,
        padding: 0,
        display: 'block',
      }}
    />
  );
};

export default Landing;
