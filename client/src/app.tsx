import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { truncateFileName } from './lib/utils';
import { useFaceLandmarkDetection } from './hooks/useFaceLandmarkDetection';
import { About } from './components/About';
import { Spinner } from './components/Spinner';
import { useFacePokeAPI } from './hooks/useFacePokeAPI';
import { Layout } from './layout';
import { useMainStore } from './hooks/useMainStore';

export function App() {
  const error = useMainStore(s => s.error);
  const setError = useMainStore(s => s.setError);
  const imageFile = useMainStore(s => s.imageFile);
  const setImageFile = useMainStore(s => s.setImageFile);
  const isGazingAtCursor = useMainStore(s => s.isGazingAtCursor);
  const setIsGazingAtCursor = useMainStore(s => s.setIsGazingAtCursor);
  const isFollowingCursor = useMainStore(s => s.isFollowingCursor);
  const setIsFollowingCursor = useMainStore(s => s.setIsFollowingCursor);

  const previewImage = useMainStore(s => s.previewImage);
  const status = useMainStore(s => s.status);
  const blendShapes = useMainStore(s => s.blendShapes);

  const {
    isDebugMode,
    setIsDebugMode,
    interruptMessage,
  } = useFacePokeAPI()

  const {
    canvasRefCallback,
    isMediaPipeReady,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    currentOpacity
  } = useFaceLandmarkDetection()

  // Refs
  const videoRef = useRef<HTMLDivElement>(null);

  // Handle file change
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setImageFile(files?.[0] || undefined)
  }, [setImageFile]);

  const handleDownload = useCallback(() => {
    if (previewImage) {
      const link = document.createElement('a');
      link.href = previewImage;
      link.download = 'modified_image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [previewImage]);

  const canDisplayBlendShapes = false

  // Display blend shapes
  const displayBlendShapes = useMemo(() => (
      <div className="mt-4">
        <h3 className="text-lg font-semibold mb-2">Blend Shapes</h3>
        <ul className="space-y-1">
          {(blendShapes?.[0]?.categories || []).map((shape, index) => (
            <li key={index} className="flex items-center">
              <span className="w-32 text-sm">{shape.categoryName || shape.displayName}</span>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${shape.score * 100}%` }}
                ></div>
              </div>
              <span className="ml-2 text-sm">{shape.score.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
  ), [JSON.stringify(blendShapes)])

  // JSX
  return (
    <Layout>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {interruptMessage && (
          <Alert>
            <AlertTitle>Notice</AlertTitle>
            <AlertDescription>{interruptMessage}</AlertDescription>
          </Alert>
        )}
        <div className="mb-5 relative">
          <div className="flex flex-row items-center justify-between w-full">
            <div className="flex items-center space-x-2">
              <div className="flex items-center justify-center">
                <input
                  id="imageInput"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={!isMediaPipeReady}
                />
                <label
                  htmlFor="imageInput"
                  className={`cursor-pointer inline-flex items-center px-3 h-10 border border-transparent text-sm font-medium rounded-md text-white ${
                    isMediaPipeReady ? 'bg-slate-600 hover:bg-slate-500' : 'bg-slate-500 cursor-not-allowed'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 shadow-xl`}
                >
                  <Spinner />
                  {imageFile ? truncateFileName(imageFile.name, 32) : (isMediaPipeReady ? 'Choose a portrait photo' : 'Initializing...')}
                </label>
              </div>
              {previewImage && (
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center px-3 h-10 border border-transparent text-sm font-medium rounded-md text-white bg-zinc-600 hover:bg-zinc-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 shadow-xl"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </button>
              )}
            </div>
            {previewImage && <div className="flex items-center space-x-2">
              {/* experimental features, not active yet */}
              {/*
              <label className="mt-4 flex items-center">
                <input
                  type="checkbox"
                  checked={isGazingAtCursor}
                  onChange={(e) => setIsGazingAtCursor(!isGazingAtCursor)}
                  className="mr-2"
                />
                Autotrack eyes
              </label>
              <label className="mt-4 flex items-center">
                <input
                  type="checkbox"
                  checked={isFollowingCursor}
                  onChange={(e) => setIsFollowingCursor(!isFollowingCursor)}
                  className="mr-2"
                />
                Autotrack head
              </label>
              */}
              <label className="mt-4 flex items-center">
                <input
                  type="checkbox"
                  checked={isDebugMode}
                  onChange={(e) => setIsDebugMode(e.target.checked)}
                  className="mr-2"
                />
                Show face markers
              </label>
            </div>}
          </div>
          {previewImage && (
            <div className="mt-5 relative shadow-2xl rounded-xl overflow-hidden">
              <img
                src={previewImage}
                alt="Preview"
                className="w-full"
              />
              <canvas
                ref={canvasRefCallback}
                className="absolute top-0 left-0 w-full h-full select-none"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: isDebugMode ? currentOpacity : 0.0,
                  transition: 'opacity 0.2s ease-in-out'
                }}
              />
            </div>
          )}
          {canDisplayBlendShapes && displayBlendShapes}
        </div>
        <About />
    </Layout>
  );
}
