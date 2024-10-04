import React, { type ReactNode } from 'react';

export function DoubleCard({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-200 to-sky-300 shadow-2xl transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl" style={{ borderTop: "solid 2px rgba(255, 255, 255, 0.2)" }}></div>
      <div className="relative px-5 py-8 bg-gradient-to-r from-cyan-100 to-sky-200 shadow-2xl sm:rounded-3xl sm:p-12" style={{ borderTop: "solid 2px #ffffff33" }}>
        <div className="max-w-lg mx-auto">
          <div className="divide-y divide-gray-200">
            <div className="text-lg leading-7 space-y-5 text-gray-700 sm:text-xl sm:leading-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
