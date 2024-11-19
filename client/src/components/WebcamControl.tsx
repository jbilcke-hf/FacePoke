import React, { useState, useEffect, useRef } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { FilesetResolver, FaceLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

interface WebcamControlProps {
  onLandmarksUpdate?: (landmarks: NormalizedLandmark[][]) => void;
  isEnabled?: boolean;
}

export default function WebcamControl({ onLandmarksUpdate, isEnabled = false }: WebcamControlProps) {
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number>();

  // Initialize MediaPipe
  useEffect(() => {
    const initializeMediaPipe = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );

      const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });

      faceLandmarkerRef.current = faceLandmarker;
      setIsMediaPipeReady(true);
    };

    initializeMediaPipe();

    return () => {
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
    };
  }, []);

  // Handle webcam stream
  useEffect(() => {
    if (!isWebcamActive || !isEnabled) return;

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
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
        setIsWebcamActive(false);
      }
    };

    startWebcam();

    return () => {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isWebcamActive, isEnabled]);

  // Process video frames
  useEffect(() => {
    if (!isWebcamActive || !isMediaPipeReady || !faceLandmarkerRef.current || !videoRef.current) return;

    const processFrame = async () => {
      if (!videoRef.current || !faceLandmarkerRef.current) return;

      if (videoRef.current.readyState === 4) {
        const startTimeMs = performance.now();
        const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

        if (results.faceLandmarks.length > 0) {
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
  }, [isWebcamActive, isMediaPipeReady, onLandmarksUpdate]);

  const toggleWebcam = () => {
    setIsWebcamActive(!isWebcamActive);
  };

  return (
    <>
      <button
        onClick={toggleWebcam}
        disabled={!isEnabled || !isMediaPipeReady}
        className={`inline-flex items-center px-2 h-8 border border-transparent text-xs font-medium rounded-md text-white ${
          isEnabled && isMediaPipeReady ? 'bg-zinc-600 hover:bg-zinc-500' : 'bg-zinc-500 cursor-not-allowed'
        } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 shadow-xl`}
      >
        {isWebcamActive ? <CameraOff className="w-4 h-4 mr-1.5" /> : <Camera className="w-4 h-4 mr-1.5" />}
        {isWebcamActive ? 'Stop Camera' : 'Start Camera'}
      </button>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
        width="640"
        height="480"
      />
    </>
  );
}
