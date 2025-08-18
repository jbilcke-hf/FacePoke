import React, { useRef, useEffect } from 'react';
import { FaceLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';

const WebcamDebugView = ({
  isDebugMode = false,
  faceLandmarker,
  onLandmarksUpdate
}: {
  isDebugMode: boolean;
  faceLandmarker: FaceLandmarker | null;
  onLandmarksUpdate?: (landmarks: any) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingUtils = useRef<DrawingUtils | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!isDebugMode) return;

    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: "user"
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // Initialize drawing utils
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) {
            drawingUtils.current = new DrawingUtils(ctx);
          }
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
      }
    };

    startWebcam();

    return () => {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDebugMode]);

  // Process video frames and draw landmarks
  useEffect(() => {
    if (!isDebugMode || !faceLandmarker || !videoRef.current || !canvasRef.current || !drawingUtils.current) return;

    const processFrame = async () => {
      if (!videoRef.current || !canvasRef.current || !drawingUtils.current) return;

      if (videoRef.current.readyState === 4) {
        // Match canvas size to video
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Clear previous frame
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        // Draw video frame
        ctx.drawImage(videoRef.current, 0, 0);

        // Detect and draw landmarks
        const startTimeMs = performance.now();
        const results = faceLandmarker.detectForVideo(videoRef.current, startTimeMs);

        if (results.faceLandmarks.length > 0) {
          // Draw landmarks
          for (const landmarks of results.faceLandmarks) {
            drawingUtils.current.drawConnectors(
              landmarks,
              FaceLandmarker.FACE_LANDMARKS_TESSELATION,
              { color: '#C0C0C070', lineWidth: 1 }
            );
            drawingUtils.current.drawConnectors(
              landmarks,
              FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
              { color: '#FF3030', lineWidth: 2 }
            );
            drawingUtils.current.drawConnectors(
              landmarks,
              FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
              { color: '#30FF30', lineWidth: 2 }
            );
            drawingUtils.current.drawConnectors(
              landmarks,
              FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
              { color: '#E0E0E0', lineWidth: 2 }
            );
          }

          // Send landmarks to parent
          onLandmarksUpdate?.(results.faceLandmarks);
        }
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    processFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDebugMode, faceLandmarker, onLandmarksUpdate]);

  if (!isDebugMode) return null;

  return (
    <div className="fixed bottom-4 right-4 w-64 h-48 bg-black rounded-lg overflow-hidden shadow-xl">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full"
      />
      <div className="absolute top-2 left-2 text-xs text-white bg-black/50 px-2 py-1 rounded">
        Debug View
      </div>
    </div>
  );
};

export default WebcamDebugView;
