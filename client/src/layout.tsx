import React, { type ReactNode, useEffect } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Prevent default touch behavior
    const preventDefaultTouchBehavior = (e: TouchEvent) => {
      if (e.target instanceof HTMLElement && e.target.tagName !== 'CANVAS') {
        e.preventDefault();
      }
    };

    document.body.addEventListener('touchmove', preventDefaultTouchBehavior, { passive: false });

    return () => {
      document.body.removeEventListener('touchmove', preventDefaultTouchBehavior);
    };
  }, []);

  return (
    <>
      <style>{`
        html, body {
          position: fixed;
          overflow: hidden;
          width: 100%;
          height: 100%;
          overscroll-behavior: none;
        }
      `}</style>
      <div className="fixed min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-300 to-stone-300"
        style={{ boxShadow: "inset 0 0 10vh 0 rgb(0 0 0 / 30%)" }}>
        <div className="min-h-screen w-full flex flex-col justify-center">
          <div className="flex flex-col items-center justify-center p-2 sm:max-w-5xl sm:mx-auto">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
