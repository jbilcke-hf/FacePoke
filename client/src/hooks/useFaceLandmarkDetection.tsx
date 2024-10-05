import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as vision from '@mediapipe/tasks-vision';

import { facePoke } from '@/lib/facePoke';
import { useMainStore } from './useMainStore';
import useThrottledCallback from 'beautiful-react-hooks/useThrottledCallback';

import { landmarkGroups, FACEMESH_LIPS, FACEMESH_LEFT_EYE, FACEMESH_LEFT_EYEBROW, FACEMESH_RIGHT_EYE, FACEMESH_RIGHT_EYEBROW, FACEMESH_FACE_OVAL } from './landmarks';

// New types for improved type safety
export type LandmarkGroup = 'lips' | 'leftEye' | 'leftEyebrow' | 'rightEye' | 'rightEyebrow' | 'faceOval' | 'background';
export type LandmarkCenter = { x: number; y: number; z: number };
export type ClosestLandmark = { group: LandmarkGroup; distance: number; vector: { x: number; y: number; z: number } };

export type MediaPipeResources = {
  faceLandmarker: vision.FaceLandmarker | null;
  drawingUtils: vision.DrawingUtils | null;
};

export function useFaceLandmarkDetection() {
  const error = useMainStore(s => s.error);
  const setError = useMainStore(s => s.setError);
  const imageFile = useMainStore(s => s.imageFile);
  const setImageFile = useMainStore(s => s.setImageFile);
  const originalImage = useMainStore(s => s.originalImage);
  const originalImageHash = useMainStore(s => s.originalImageHash);
  const setOriginalImageHash = useMainStore(s => s.setOriginalImageHash);
  const previewImage = useMainStore(s => s.previewImage);
  const setPreviewImage = useMainStore(s => s.setPreviewImage);
  const resetImage = useMainStore(s => s.resetImage);

  ;(window as any).debugJuju = useMainStore;
  ////////////////////////////////////////////////////////////////////////
  // ok so apparently I cannot vary the latency, or else there is a bug
  // const averageLatency = useMainStore(s => s.averageLatency);
  const averageLatency = 220
  ////////////////////////////////////////////////////////////////////////

  // State for face detection
  const [faceLandmarks, setFaceLandmarks] = useState<vision.NormalizedLandmark[][]>([]);
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
  const [isDrawingUtilsReady, setIsDrawingUtilsReady] = useState(false);
  const [blendShapes, setBlendShapes] = useState<vision.Classifications[]>([]);

  // State for mouse interaction
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastModifiedImageHashRef = useRef<string | null>(null);

  const [currentLandmark, setCurrentLandmark] = useState<ClosestLandmark | null>(null);
  const [previousLandmark, setPreviousLandmark] = useState<ClosestLandmark | null>(null);
  const [currentOpacity, setCurrentOpacity] = useState(0);
  const [previousOpacity, setPreviousOpacity] = useState(0);

  const [isHovering, setIsHovering] = useState(false);

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



  const modifyImage = useCallback(({ landmark, vector }: {
      landmark: ClosestLandmark
      vector: { x: number; y: number; z: number }
    }) => {

    const {
      originalImage,
      originalImageHash,
      params: previousParams,
      setParams,
      setError
    } = useMainStore.getState()


    if (!originalImage) {
      console.error('Image file or facePoke not available');
      return;
    }

    const params = {
      ...previousParams
    }

    const minX = -0.50;
    const maxX = 0.50;
    const minY = -0.50;
    const maxY = 0.50;

    // Function to map a value from one range to another
    const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
      return Math.min(outMax, Math.max(outMin, ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin));
    };

    console.log("modifyImage:", {
      originalImage,
      originalImageHash,
      landmark,
      vector,
      minX,
      maxX,
      minY,
      maxY,
    })

    // Map landmarks to ImageModificationParams
    switch (landmark.group) {
      case 'leftEye':
      case 'rightEye':
         // eyebrow (min: -20, max: 5, default: 0)
        const eyesMin = -20
        const eyesMax = 5
        params.eyes = mapRange(-vector.y, minX, maxX, eyesMin, eyesMax);

        break;
      case 'leftEyebrow':
      case 'rightEyebrow':
        // moving the mouse vertically for the eyebrow
        // should make them up/down
        // eyebrow (min: -10, max: 15, default: 0)
        const eyebrowMin = -10
        const eyebrowMax = 15
        params.eyebrow = mapRange(-vector.y, minY, maxY, eyebrowMin, eyebrowMax);

        break;
      case 'lips':
        // aaa (min: -30, max: 120, default: 0)
        //const aaaMin = -30
        //const aaaMax = 120
        //params.aaa = mapRange(vector.x, minY, maxY, aaaMin, aaaMax);

        // eee (min: -20, max: 15, default: 0)
        const eeeMin = -20
        const eeeMax = 15
        params.eee = mapRange(-vector.y, minY, maxY, eeeMin, eeeMax);


        // woo (min: -20, max: 15, default: 0)
        const wooMin = -20
        const wooMax = 15
        params.woo = mapRange(-vector.x, minX, maxX, wooMin, wooMax);

        break;
      case 'faceOval':
          // displacing the face horizontally by moving the mouse on the X axis
          // should perform a yaw rotation
          // rotate_roll (min: -20, max: 20, default: 0)
          const rollMin = -40
          const rollMax = 40

          // note: we invert the axis here
          params.rotate_roll = mapRange(vector.x, minX, maxX, rollMin, rollMax);
          break;

      case 'background':
        // displacing the face horizontally by moving the mouse on the X axis
        // should perform a yaw rotation
        // rotate_yaw (min: -20, max: 20, default: 0)
        const yawMin = -40
        const yawMax = 40

        // note: we invert the axis here
        params.rotate_yaw = mapRange(-vector.x, minX, maxX, yawMin, yawMax);

        // displacing the face vertically by moving the mouse on the Y axis
        // should perform a pitch rotation
        // rotate_pitch (min: -20, max: 20, default: 0)
        const pitchMin = -40
        const pitchMax = 40
        params.rotate_pitch = mapRange(vector.y, minY, maxY, pitchMin, pitchMax);
        break;
      default:
        return
    }

    for (const [key, value] of Object.entries(params)) {
      if (isNaN(value as any) || !isFinite(value as any)) {
        console.log(`${key} is NaN, aborting`)
        return
      }
    }
    console.log(`PITCH=${params.rotate_pitch || 0}, YAW=${params.rotate_yaw || 0}, ROLL=${params.rotate_roll || 0}`);

    setParams(params)
    try {
      // For the first request or when the image file changes, send the full image
      if (!lastModifiedImageHashRef.current || lastModifiedImageHashRef.current !== originalImageHash) {
        lastModifiedImageHashRef.current = originalImageHash;
        facePoke.modifyImage(originalImage, null, params);
      } else {
        // For subsequent requests, send only the hash
        facePoke.modifyImage(null, lastModifiedImageHashRef.current, params);
      }
    } catch (error) {
      // console.error('Error modifying image:', error);
      setError('Failed to modify image');
    }
  }, []);

  // this is throttled by our average latency
  const modifyImageWithRateLimit = useThrottledCallback((params: {
    landmark: ClosestLandmark
    vector: { x: number; y: number; z: number }
  }) => {
    modifyImage(params);
  }, [modifyImage], averageLatency);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);

  // Update mouse event handlers
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    const landmark = findClosestLandmark(x, y);
    console.log(`Mouse down on ${landmark.group}`);
    setActiveLandmark(landmark);
    setDragStart({ x, y });
    dragStartRef.current = { x, y };
  }, [findClosestLandmark, setActiveLandmark, setDragStart]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    // only send an API request to modify the image if we are actively dragging
    if (dragStart && dragStartRef.current) {

      const landmark = findClosestLandmark(x, y, currentLandmark?.group);

      console.log(`Dragging mouse (was over ${currentLandmark?.group || 'nothing'}, now over ${landmark.group})`);

      // Compute the vector from the landmark center to the current mouse position
      modifyImageWithRateLimit({
        landmark: currentLandmark || landmark, // this will still use the initially selected landmark
        vector: {
          x: x - landmarkCenters[landmark.group].x,
          y: y - landmarkCenters[landmark.group].y,
          z: 0 // Z is 0 as mouse interaction is 2D
        }
      });
      setIsDragging(true);
    } else {
      const landmark = findClosestLandmark(x, y);

      //console.log(`Moving mouse over ${landmark.group}`);
      // console.log(`Simple mouse move over ${landmark.group}`);

      // we need to be careful here, we don't want to change the active
      // landmark dynamically if we are busy dragging

      if (!currentLandmark || (currentLandmark?.group !== landmark?.group)) {
        // console.log("setting activeLandmark to ", landmark);
        setActiveLandmark(landmark);
      }
      setIsHovering(true); // Ensure hovering state is maintained during movement
    }
  }, [currentLandmark, dragStart, setIsHovering, setActiveLandmark, setIsDragging, modifyImageWithRateLimit, landmarkCenters]);

  const handleMouseUp = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    // only send an API request to modify the image if we are actively dragging
    if (dragStart && dragStartRef.current) {

      const landmark = findClosestLandmark(x, y, currentLandmark?.group);

      console.log(`Mouse up (was over ${currentLandmark?.group || 'nothing'}, now over ${landmark.group})`);

      // Compute the vector from the landmark center to the current mouse position
      modifyImageWithRateLimit({
        landmark: currentLandmark || landmark, // this will still use the initially selected landmark
        vector: {
          x: x - landmarkCenters[landmark.group].x,
          y: y - landmarkCenters[landmark.group].y,
          z: 0 // Z is 0 as mouse interaction is 2D
        }
      });
    }

    setIsDragging(false);
    dragStartRef.current = null;
    setActiveLandmark(undefined);
  }, [currentLandmark, isDragging, modifyImageWithRateLimit, findClosestLandmark, setActiveLandmark, landmarkCenters, modifyImageWithRateLimit, setIsDragging]);

  useEffect(() => {
    facePoke.setOnModifiedImage((image: string, image_hash: string) => {
      if (image) {
        setPreviewImage(image);
      }
      setOriginalImageHash(image_hash);
      lastModifiedImageHashRef.current = image_hash;
    });
  }, [setPreviewImage, setOriginalImageHash]);

  return {
    canvasRef,
    canvasRefCallback,
    mediaPipeRef,
    faceLandmarks,
    isMediaPipeReady,
    isDrawingUtilsReady,
    blendShapes,

    //dragStart,
    //setDragStart,
    //dragEnd,
    //setDragEnd,
    setFaceLandmarks,
    setBlendShapes,

    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleMouseEnter,
    handleMouseLeave,

    currentLandmark,
    currentOpacity,
  }
}
