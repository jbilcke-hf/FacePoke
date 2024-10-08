import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as vision from '@mediapipe/tasks-vision';

import { facePoke } from '@/lib/facePoke';
import { useMainStore } from './useMainStore';
import useThrottledCallback from 'beautiful-react-hooks/useThrottledCallback';

import { landmarkGroups, FACEMESH_LIPS, FACEMESH_LEFT_EYE, FACEMESH_LEFT_EYEBROW, FACEMESH_RIGHT_EYE, FACEMESH_RIGHT_EYEBROW, FACEMESH_FACE_OVAL } from './landmarks';
import type { ActionMode, ClosestLandmark, LandmarkCenter, LandmarkGroup, MediaPipeResources } from '@/types';

export function useFaceLandmarkDetection() {
  const setError = useMainStore(s => s.setError);
  const previewImage = useMainStore(s => s.previewImage);
  const handleServerResponse = useMainStore(s => s.handleServerResponse);
  const faceLandmarks = useMainStore(s => s.faceLandmarks);

  ////////////////////////////////////////////////////////////////////////
  // if we only send the face/square then we can use 138ms
  // unfortunately it doesn't work well yet
  // const throttleInMs = 138ms
  const throttleInMs = 220
  ////////////////////////////////////////////////////////////////////////

  // State for face detection
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
  const [isDrawingUtilsReady, setIsDrawingUtilsReady] = useState(false);

  // State for mouse interaction
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const [currentLandmark, setCurrentLandmark] = useState<ClosestLandmark | null>(null);
  const [previousLandmark, setPreviousLandmark] = useState<ClosestLandmark | null>(null);
  const [currentOpacity, setCurrentOpacity] = useState(0);
  const [previousOpacity, setPreviousOpacity] = useState(0);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaPipeRef = useRef<MediaPipeResources>({
    faceLandmarker: null,
    drawingUtils: null,
  });

  const setActiveLandmark = useCallback((newLandmark: ClosestLandmark | undefined) => {
    //if (newLandmark && (!currentLandmark || newLandmark.group !== currentLandmark.group)) {
      setPreviousLandmark(currentLandmark || null);
      setCurrentLandmark(newLandmark || null);
      setCurrentOpacity(0);
      setPreviousOpacity(1);
    //}
  }, [currentLandmark, setPreviousLandmark, setCurrentLandmark, setCurrentOpacity, setPreviousOpacity]);

  // Initialize MediaPipe
  useEffect(() => {
    console.log('Initializing MediaPipe...');
    let isMounted = true;

    const initializeMediaPipe = async () => {
      const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;

      try {
        console.log('Initializing FilesetResolver...');
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        console.log('Creating FaceLandmarker...');
        const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "IMAGE",
          numFaces: 1
        });

        if (isMounted) {
          console.log('FaceLandmarker created successfully.');
          mediaPipeRef.current.faceLandmarker = faceLandmarker;
          setIsMediaPipeReady(true);
        } else {
          faceLandmarker.close();
        }
      } catch (error) {
        console.error('Error during MediaPipe initialization:', error);
        setError('Failed to initialize face detection. Please try refreshing the page.');
      }
    };

    initializeMediaPipe();


    return () => {
      isMounted = false;
      if (mediaPipeRef.current.faceLandmarker) {
        mediaPipeRef.current.faceLandmarker.close();
      }
    };
  }, []);

  // New state for storing landmark centers
  const [landmarkCenters, setLandmarkCenters] = useState<Record<LandmarkGroup, LandmarkCenter>>({} as Record<LandmarkGroup, LandmarkCenter>);

  // Function to compute the center of each landmark group
  const computeLandmarkCenters = useCallback((landmarks: vision.NormalizedLandmark[]) => {
    const centers: Record<LandmarkGroup, LandmarkCenter> = {} as Record<LandmarkGroup, LandmarkCenter>;

    const computeGroupCenter = (group: Readonly<Set<number[]>>): LandmarkCenter => {
      let sumX = 0, sumY = 0, sumZ = 0, count = 0;
      group.forEach(([index]) => {
        if (landmarks[index]) {
          sumX += landmarks[index].x;
          sumY += landmarks[index].y;
          sumZ += landmarks[index].z || 0;
          count++;
        }
      });
      return { x: sumX / count, y: sumY / count, z: sumZ / count };
    };

    centers.lips = computeGroupCenter(FACEMESH_LIPS);
    centers.leftEye = computeGroupCenter(FACEMESH_LEFT_EYE);
    centers.leftEyebrow = computeGroupCenter(FACEMESH_LEFT_EYEBROW);
    centers.rightEye = computeGroupCenter(FACEMESH_RIGHT_EYE);
    centers.rightEyebrow = computeGroupCenter(FACEMESH_RIGHT_EYEBROW);
    centers.faceOval = computeGroupCenter(FACEMESH_FACE_OVAL);
    centers.background = { x: 0.5, y: 0.5, z: 0 };

    setLandmarkCenters(centers);
    // console.log('Landmark centers computed:', centers);
  }, []);

   // Function to find the closest landmark to the mouse position
   const findClosestLandmark = useCallback((mouseX: number, mouseY: number, isGroup?: LandmarkGroup): ClosestLandmark => {
    const defaultLandmark: ClosestLandmark = {
      group: 'background',
      distance: 0,
      vector: {
        x: mouseX,
        y: mouseY,
        z: 0
      }
    }

    if (Object.keys(landmarkCenters).length === 0) {
      console.warn('Landmark centers not computed yet');
      return defaultLandmark;
    }

    let closestGroup: LandmarkGroup | null = null;
    let minDistance = Infinity;
    let closestVector = { x: 0, y: 0, z: 0 };
    let faceOvalDistance = Infinity;
    let faceOvalVector = { x: 0, y: 0, z: 0 };

    Object.entries(landmarkCenters).forEach(([group, center]) => {
      const dx = mouseX - center.x;
      const dy = mouseY - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (group === 'faceOval') {
        faceOvalDistance = distance;
        faceOvalVector = { x: dx, y: dy, z: 0 };
      }

      // filter to keep the group if it is belonging to  `ofGroup`
      if (isGroup) {
        if (group !== isGroup) {
          return
        }
      }

      if (distance < minDistance) {
        minDistance = distance;
        closestGroup = group as LandmarkGroup;
        closestVector = { x: dx, y: dy, z: 0 }; // Z is 0 as mouse interaction is 2D
      }
    });

    // Fallback to faceOval if no group found or distance is too large
    if (minDistance > 0.05) {
      // console.log('Distance is too high, so we use the faceOval group');
      closestGroup = 'background';
      minDistance = faceOvalDistance;
      closestVector = faceOvalVector;
    }

    if (closestGroup) {
      // console.log(`Closest landmark: ${closestGroup}, distance: ${minDistance.toFixed(4)}`);
      return { group: closestGroup, distance: minDistance, vector: closestVector };
    } else {
      // console.log('No group found, returning fallback');
      return defaultLandmark
    }
  }, [landmarkCenters]);

  // Detect face landmarks
  const detectFaceLandmarks = useCallback(async (imageDataUrl: string) => {
    const { setFaceLandmarks,setBlendShapes } = useMainStore.getState();


    // console.log('Attempting to detect face landmarks...');
    if (!isMediaPipeReady) {
      console.log('MediaPipe not ready. Skipping detection.');
      return;
    }

    const faceLandmarker = mediaPipeRef.current.faceLandmarker;

    if (!faceLandmarker) {
      console.error('FaceLandmarker is not initialized.');
      return;
    }

    const drawingUtils = mediaPipeRef.current.drawingUtils;

    const image = new Image();
    image.src = imageDataUrl;
    await new Promise((resolve) => { image.onload = resolve; });

    const faceLandmarkerResult = faceLandmarker.detect(image);
    // console.log("Face landmarks detected:", faceLandmarkerResult);

    setFaceLandmarks(faceLandmarkerResult.faceLandmarks);
    setBlendShapes(faceLandmarkerResult.faceBlendshapes || []);


    if (faceLandmarkerResult.faceLandmarks && faceLandmarkerResult.faceLandmarks[0]) {
      computeLandmarkCenters(faceLandmarkerResult.faceLandmarks[0]);
    }

    if (canvasRef.current && drawingUtils) {
      drawLandmarks(faceLandmarkerResult.faceLandmarks[0], canvasRef.current, drawingUtils);
    }
  }, [isMediaPipeReady, isDrawingUtilsReady, computeLandmarkCenters]);

  const drawLandmarks = useCallback((
    landmarks: vision.NormalizedLandmark[],
    canvas: HTMLCanvasElement,
    drawingUtils: vision.DrawingUtils
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (canvasRef.current && previewImage) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        const drawLandmarkGroup = (landmark: ClosestLandmark | null, opacity: number) => {
          if (!landmark) return;
          const connections = landmarkGroups[landmark.group];
          if (connections) {
            ctx.globalAlpha = opacity;
            drawingUtils.drawConnectors(
              landmarks,
              connections,
              { color: 'orange', lineWidth: 4 }
            );
          }
        };

        drawLandmarkGroup(previousLandmark, previousOpacity);
        drawLandmarkGroup(currentLandmark, currentOpacity);

        ctx.globalAlpha = 1;
      };
      img.src = previewImage;
    }
  }, [previewImage, currentLandmark, previousLandmark, currentOpacity, previousOpacity]);

  useEffect(() => {
    if (isMediaPipeReady && isDrawingUtilsReady && faceLandmarks.length > 0 && canvasRef.current && mediaPipeRef.current.drawingUtils) {
      drawLandmarks(faceLandmarks[0], canvasRef.current, mediaPipeRef.current.drawingUtils);
    }
  }, [isMediaPipeReady, isDrawingUtilsReady, faceLandmarks, currentLandmark, previousLandmark, currentOpacity, previousOpacity, drawLandmarks]);
  useEffect(() => {
    let animationFrame: number;
    const animate = () => {
      setCurrentOpacity((prev) => Math.min(prev + 0.2, 1));
      setPreviousOpacity((prev) => Math.max(prev - 0.2, 0));

      if (currentOpacity < 1 || previousOpacity > 0) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [currentLandmark]);

  // Canvas ref callback
  const canvasRefCallback = useCallback((node: HTMLCanvasElement | null) => {
    if (node !== null) {
      const ctx = node.getContext('2d');
      if (ctx) {
        // Get device pixel ratio
        const pixelRatio = window.devicePixelRatio || 1;

        // Scale canvas based on the pixel ratio
        node.width = node.clientWidth * pixelRatio;
        node.height = node.clientHeight * pixelRatio;
        ctx.scale(pixelRatio, pixelRatio);

        mediaPipeRef.current.drawingUtils = new vision.DrawingUtils(ctx);
        setIsDrawingUtilsReady(true);
      } else {
        console.error('Failed to get 2D context from canvas.');
      }
      canvasRef.current = node;
    }
  }, []);


  useEffect(() => {
    if (!isMediaPipeReady) {
      console.log('MediaPipe not ready. Skipping landmark detection.');
      return
    }
    if (!previewImage) {
      console.log('Preview image not ready. Skipping landmark detection.');
      return
    }
    if (!isDrawingUtilsReady) {
      console.log('DrawingUtils not ready. Skipping landmark detection.');
      return
    }
    detectFaceLandmarks(previewImage);
  }, [isMediaPipeReady, isDrawingUtilsReady, previewImage])

  const modifyImageWithRateLimit = useThrottledCallback((params: {
    landmark: ClosestLandmark
    vector: { x: number; y: number; z: number }
    mode: ActionMode
  }) => {
    useMainStore.getState().modifyImage(params);
  }, [], throttleInMs);

  useEffect(() => {
    facePoke.setOnServerResponse(handleServerResponse);
  }, [handleServerResponse]);

  const handleStart = useCallback((x: number, y: number, mode: ActionMode) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const normalizedX = (x - rect.left) / rect.width;
    const normalizedY = (y - rect.top) / rect.height;

    const landmark = findClosestLandmark(normalizedX, normalizedY);
    // console.log(`Interaction start on ${landmark.group}`);
    setActiveLandmark(landmark);
    setDragStart({ x: normalizedX, y: normalizedY });
    dragStartRef.current = { x: normalizedX, y: normalizedY };
  }, [findClosestLandmark, setActiveLandmark, setDragStart]);

  const handleMove = useCallback((x: number, y: number,  mode: ActionMode) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const normalizedX = (x - rect.left) / rect.width;
    const normalizedY = (y - rect.top) / rect.height;

    const landmark = findClosestLandmark(
      normalizedX,
      normalizedY,
      dragStart && dragStartRef.current ? currentLandmark?.group : undefined
    );

    const landmarkData = landmarkCenters[landmark?.group]
    const vector = landmarkData ? {
      x: normalizedX - landmarkData.x,
      y: normalizedY - landmarkData.y,
      z: 0
    } :  {
      x: 0.5,
      y: 0.5,
      z: 0
    }

    if (dragStart && dragStartRef.current) {
      setIsDragging(true);
      modifyImageWithRateLimit({
        landmark: currentLandmark || landmark,
        vector,
        mode
      });
    } else {
      if (!currentLandmark || (currentLandmark?.group !== landmark?.group)) {
        setActiveLandmark(landmark);
      }

      /*
      modifyImageWithRateLimit({
        landmark,
        vector,
        mode: 'HOVERING'
      });
      */
    }
  }, [currentLandmark, dragStart, setActiveLandmark, setIsDragging, modifyImageWithRateLimit, landmarkCenters]);

  const handleEnd = useCallback((x: number, y: number,  mode: ActionMode) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const normalizedX = (x - rect.left) / rect.width;
    const normalizedY = (y - rect.top) / rect.height;

    if (dragStart && dragStartRef.current) {
      const landmark = findClosestLandmark(normalizedX, normalizedY, currentLandmark?.group);

      modifyImageWithRateLimit({
        landmark: currentLandmark || landmark,
        vector: {
          x: normalizedX - landmarkCenters[landmark.group].x,
          y: normalizedY - landmarkCenters[landmark.group].y,
          z: 0
        },
        mode
      });
    }

    setIsDragging(false);
    dragStartRef.current = null;
    setActiveLandmark(undefined);
  }, [currentLandmark, isDragging, modifyImageWithRateLimit, findClosestLandmark, setActiveLandmark, landmarkCenters, setIsDragging]);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const  mode: ActionMode = event.button === 0 ? 'PRIMARY' : 'SECONDARY';
    handleStart(event.clientX, event.clientY, mode);
  }, [handleStart]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const  mode: ActionMode =  event.buttons === 1 ? 'PRIMARY' : 'SECONDARY';
    handleMove(event.clientX, event.clientY, mode);
  }, [handleMove]);

  const handleMouseUp = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const  mode: ActionMode = event.buttons === 1 ? 'PRIMARY' : 'SECONDARY';
    handleEnd(event.clientX, event.clientY, mode);
  }, [handleEnd]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    const  mode: ActionMode = event.touches.length === 1 ? 'PRIMARY' : 'SECONDARY';
    const touch = event.touches[0];
    handleStart(touch.clientX, touch.clientY, mode);
  }, [handleStart]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    const  mode: ActionMode = event.touches.length === 1 ? 'PRIMARY' : 'SECONDARY';
    const touch = event.touches[0];
    handleMove(touch.clientX, touch.clientY, mode);
  }, [handleMove]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    const  mode: ActionMode = event.changedTouches.length === 1 ? 'PRIMARY' : 'SECONDARY';
    const touch = event.changedTouches[0];
    handleEnd(touch.clientX, touch.clientY, mode);
  }, [handleEnd]);

  return {
    canvasRef,
    canvasRefCallback,
    mediaPipeRef,
    isMediaPipeReady,
    isDrawingUtilsReady,

    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,

    currentLandmark,
    currentOpacity,
  }
}
