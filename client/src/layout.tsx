import React, { type ReactNode } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-300 to-stone-300"
      style={{ boxShadow: "inset 0 0 10vh 0 rgb(0 0 0 / 30%)" }}>
      <div className="min-h-screen w-full py-8 flex flex-col justify-center">
        <div className="flex flex-col items-center justify-center p-4 sm:max-w-5xl sm:mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
