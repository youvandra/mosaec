'use client';

import { useEffect } from 'react';

import { reportError } from '../lib/report';

/** Last resort when the root layout itself fails: report it and offer a reload. */
export default function GlobalError({ error }: { readonly error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error, { area: 'boundary' });
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#ffffff',
          color: '#141414',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>Something broke on our side.</h1>
          <p style={{ color: '#707070', margin: '0 0 20px' }}>
            Your packs are safe on chain. Reload to try again.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              borderRadius: 100,
              background: '#141414',
              color: '#ffffff',
              border: 0,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
