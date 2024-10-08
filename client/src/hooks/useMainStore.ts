import { create } from 'zustand'

import * as vision from '@mediapipe/tasks-vision'

import { truncateFileName } from '@/lib/utils'
import { convertImageToBase64 } from '@/lib/convertImageToBase64'
import { type Metadata, type ImageModificationParams, type OnServerResponseParams, type ActionMode, type ImageStateValues, type ClosestLandmark } from '@/types'
import { mapRange } from '@/lib/mapRange'
import { facePoke } from '@/lib/facePoke'


export type ImageState = ImageStateValues & {
  setStatus: (status?: string) => void
  setError: (error?: string) => void
  setFaceLandmarks: (faceLandmarks: vision.NormalizedLandmark[][]) => void
  setBlendShapes: (blendShapes: vision.Classifications[]) => void
  setImageFile: (file?: File) => Promise<void>
  setIsFollowingCursor: (isFollowingCursor: boolean) => void
  setIsGazingAtCursor: (isGazingAtCursor: boolean) => void
  setOriginalImage: (url: string) => void
  setOriginalImageUuid: (uuid: string) => void
  setPreviewImage: (url: string) => void
  resetImage: () => void
  setAverageLatency: (averageLatency: number) => void
  setActiveLandmark: (activeLandmark?: ClosestLandmark) => void
  setMetadata: (metadata?: Metadata) => void
  setParams: (params: Partial<ImageModificationParams>) => void
  handleServerResponse: (params: OnServerResponseParams) => Promise<void>
  applyModifiedHeadToCanvas: (headImageBlob: Blob) => Promise<string>
  modifyImage: ({ landmark, vector, mode }: {
    landmark: ClosestLandmark
    vector: { x: number; y: number; z: number }
    mode: ActionMode
  }) => Promise<void>
}

export const getDefaultState = (): ImageStateValues => ({
  status: '',
  error: '',
  imageFile: null,
  isFollowingCursor: false,
  isGazingAtCursor: false,
  originalImage: '',
  originalImageUuid: '',
  previewImage: '',
  minLatency: 20, // min time between requests
  averageLatency: 190, // this should be the average for most people
  maxLatency: 4000, // max time between requests
  activeLandmark: undefined,
  metadata: {
    center: [0, 0],
    size: 0,
    bbox: [[0,0],[0,0],[0,0],[0,0]],
    angle: 0,
  },
  params: {},
  faceLandmarks: [],
  blendShapes: [],
})

export const useMainStore = create<ImageState>((set, get) => ({
  ...getDefaultState(),
  setStatus: (status: string = '') => set({ status }),
  setError: (error: string = '') => set({ error }),
  setFaceLandmarks: (faceLandmarks: vision.NormalizedLandmark[][]) => {
    set({ faceLandmarks })
  },
  setBlendShapes: (blendShapes: vision.Classifications[]) => {
    set({ blendShapes })
  },
  setImageFile: async (file?: File) => {
    if (!file) {
      set({
        ...getDefaultState(),
        status: 'No file selected',
      })
      return;
    }

    try {
      const image = await convertImageToBase64(file);
      set({
        ...getDefaultState(),
        imageFile: file,
        status: `File selected: ${truncateFileName(file.name, 16)}`,
        previewImage: image,
        originalImage: image,
      })
      facePoke.loadImage(image);
    } catch (err) {
      console.log(`failed to load the image: `, err);
      set({
        ...getDefaultState(),
        status: 'Failed to load the image',
      })
    }
  },
  setIsFollowingCursor: (isFollowingCursor: boolean) => set({ isFollowingCursor }),
  setIsGazingAtCursor: (isGazingAtCursor: boolean) => set({ isGazingAtCursor }),
  setOriginalImage: (url) => set({ originalImage: url }),
  setOriginalImageUuid: (originalImageUuid) => set({ originalImageUuid }),
  setPreviewImage: (url) => set({ previewImage: url }),
  resetImage: () => {
    const { originalImage } = get()
    if (originalImage) {
      set({ previewImage: originalImage })
    }
  },
  setAverageLatency: (averageLatency: number) => set({ averageLatency }),
  setActiveLandmark: (activeLandmark?: ClosestLandmark) => set({ activeLandmark }),
  setMetadata: (metadata?: Metadata) => set(metadata ? {
    metadata
  } : {
    metadata: getDefaultState().metadata,
  }),
  setParams: (params: Partial<ImageModificationParams>) => {
    const {params: previousParams } = get()
    set({ params: {
      ...previousParams,
      ...params
    }})
  },
  handleServerResponse: async (params: OnServerResponseParams) => {
    const { originalImage, setMetadata, setPreviewImage, setOriginalImageUuid, applyModifiedHeadToCanvas, modifyImage } = useMainStore.getState();
    if (typeof params.error === "string") {
      console.error(`handleServerResponse: failed to perform the request, resetting the app (${params.error})`)
      setPreviewImage(originalImage)
      setOriginalImageUuid('')
    } else if (typeof params.image !== "undefined") {

      // this is where we decide to paste back the image as a whole,
      // or apply some shenanigans to only past back the head.
      // the part about the head is not done yet, so we do it all for now.

      //  --- old way: use it whole ---
      const image = await convertImageToBase64(params.image);

      //  --- future way: try to only apply the head ---
      // const image = await applyModifiedHeadToCanvas(params.image);

      setPreviewImage(image);
    } else if (typeof params.loaded !== "undefined") {
      //console.log(`handleServerResponse: received a json`, params)
      setOriginalImageUuid(params.loaded.u)
      setMetadata({
        center: params.loaded.c, // center - 2x1
        size: params.loaded.s, // size - scalar
        bbox: params.loaded.b, // bbox - 4x2
        angle: params.loaded.a,  //angle - rad, counterclockwise
      })

      // right after we received the id, we perform a first blank request
      await modifyImage({
        landmark: {
          group: 'background',
          distance: 0,
          vector: { x: 0.5, y: 0.5, z: 0 }
        },
        vector: {x: 0, y: 0, z: 0 },
        mode: 'PRIMARY'
      })
    } else {
      console.log(`handleServerResponse: received an unknown json`, params)
    }
  },

  applyModifiedHeadToCanvas: async (headImageBlob: Blob): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      const originalImg = new Image();

      const { originalImage, metadata } = useMainStore.getState();
      originalImg.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get 2D context'));
          return;
        }

        // Get device pixel ratio
        const pixelRatio = window.devicePixelRatio || 1;

        canvas.width = originalImg.width;
        canvas.height = originalImg.height;

        // Draw original image
        ctx.drawImage(originalImg, 0, 0);

        const headImageBitmap = await createImageBitmap(headImageBlob, {
          resizeQuality: 'high'
        });

        // Create a temporary canvas for the head image with gradient
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        if (!tempCtx) {
          reject(new Error('Failed to get 2D context for temporary canvas'));
          return;
        }

        tempCanvas.width = headImageBitmap.width;
        tempCanvas.height = headImageBitmap.height;

        // Draw the head image on the temporary canvas
        tempCtx.drawImage(headImageBitmap, 0, 0);

        // Create gradient mask
        const gradientSize = 20; // Size of the gradient in pixels
        const gradient = tempCtx.createRadialGradient(
          tempCanvas.width / 2, tempCanvas.height / 2, Math.min(tempCanvas.width, tempCanvas.height) / 2 - gradientSize,
          tempCanvas.width / 2, tempCanvas.height / 2, Math.min(tempCanvas.width, tempCanvas.height) / 2
        );

        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        // Apply gradient mask
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.fillStyle = gradient;
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        console.log("metadata:", metadata);
        ctx.save();
        ctx.rotate(metadata.angle);

        // TODO: this is where we need to grab the coordinates from the metadata and start drawing our image
        // now the issue if that there is an angle, so we need to see how this impacts the transformation
        ctx.restore();
        /*
          TODO finish the implementation

          console.log("metadata:", metadata);
          ctx.save();
          ctx.rotate(metadata.angle);

          // TODO we need the coordinate inside the final image
          ctx.drawImage(
            tempCanvas,
            topLeftCornerX,
            topLeftCornerY,
            width,
            height,
          );

          ctx.restore();
        */


        // Our head image already contains compression artifacts,
        // so let's avoid double-encoding in here and use PNG
        resolve(canvas.toDataURL('image/png'));
      };

      originalImg.src = originalImage;
    })
  },
  modifyImage: async ({ landmark, vector, mode }: {
    landmark: ClosestLandmark
    vector: { x: number; y: number; z: number }
    mode: ActionMode
  }): Promise<void> => {

    const {
      originalImage,
      originalImageUuid,
      params: previousParams,
      setParams,
      setError,
      isFollowingCursor,
      isGazingAtCursor
    } = get()


    if (!originalImage) {
      console.error('Image file or facePoke not available');
      return;
    }

    const params = {
      ...previousParams
    }

    const generalControl = {
      minX: -0.30,
      maxX: 0.30,
      minY: -0.30,
      maxY: 0.30
    }

    const pupilControl = {
      minX: -0.50,
      maxX: 0.50,
      minY: -0.50,
      maxY: 0.50
    }

    const eyeControl = {
      minX: -0.50,
      maxX: 0.50,
      minY: -0.50,
      maxY: 0.50
    }

    // for the min and max value, we can look here:
    // https://github.com/fofr/cog-expression-editor/blob/main/predict.py

    // regardless of the landmark, those rule will apply
    if (isFollowingCursor) {
      // displacing the face horizontally by moving the mouse on the X axis
      // should perform a yaw rotation
      // rotate_yaw (min: -20, max: 20, default: 0)
      const yawMin = -40
      const yawMax = 40

      // note: we invert the axis here
      params.rotate_yaw = mapRange(-vector.x, generalControl.minX, generalControl.maxX, yawMin, yawMax);

      // displacing the face vertically by moving the mouse on the Y axis
      // should perform a pitch rotation
      // rotate_pitch (min: -20, max: 20, default: 0)
      const pitchMin = -40
      const pitchMax = 40
      params.rotate_pitch = mapRange(vector.y, generalControl.minY, generalControl.maxY, pitchMin, pitchMax);
    }

    if (isGazingAtCursor) {
      const pupilsXMin = -15
      const pupilsXMax = 15
      params.pupil_x = mapRange(vector.x, pupilControl.minX, pupilControl.maxX, pupilsXMin, pupilsXMax);
      const pupilsYMin = -2 // -15
      const pupilsYMax = 8 // 15
      params.pupil_y = mapRange(-vector.y, pupilControl.minY, pupilControl.maxY, pupilsYMin, pupilsYMax);
    }

    // if the user clicked on the primary or secondary button,
    // then it triggers some more things
    if (mode !== 'HOVERING') {
      switch (landmark.group) {
        case 'leftEye':
        case 'rightEye':
         // if (mode === 'PRIMARY') {
            const pupilsXMin = -15
            const pupilsXMax = 15
            params.pupil_x = mapRange(vector.x, pupilControl.minX, pupilControl.maxX, pupilsXMin, pupilsXMax);

            const eyesMin = -20
            const eyesMax = 5
            params.eyes = mapRange(-vector.y, eyeControl.minX, eyeControl.maxX, eyesMin, eyesMax);
          //}

          break;
        case 'leftEyebrow':
        case 'rightEyebrow':
          // moving the mouse vertically for the eyebrow
          // should make them up/down
          // eyebrow (min: -10, max: 15, default: 0)
          const eyebrowMin = -10
          const eyebrowMax = 15
          params.eyebrow = mapRange(-vector.y, eyeControl.minY, eyeControl.maxY, eyebrowMin, eyebrowMax);

          break;
        case 'lips':
          // aaa (min: -30, max: 120, default: 0)
          const aaaMin = -30
          const aaaMax = 120
          params.aaa = mapRange(-vector.y, eyeControl.minY, eyeControl.maxY, aaaMin, aaaMax);

          // eee (min: -20, max: 15, default: 0)
          const eeeMin = -20
          const eeeMax = 15
          params.eee = mapRange(vector.x, eyeControl.minX, eyeControl.maxX, eeeMin, eeeMax);

          // woo (min: -20, max: 15, default: 0)
          //const wooMin = -20
          //const wooMax = 15
          //params.woo = mapRange(-vector.x, eyeControl.minX, eyeControl.maxX, wooMin, wooMax);

          break;
        case 'faceOval':
            // displacing the face horizontally by moving the mouse on the X axis
            // should perform a yaw rotation
            // rotate_roll (min: -20, max: 20, default: 0)
            const rollMin = -40
            const rollMax = 40

            // note: we invert the axis here
            params.rotate_roll = mapRange(vector.x, eyeControl.minX, eyeControl.maxX, rollMin, rollMax);
            break;

        case 'background':
          // displacing the face horizontally by moving the mouse on the X axis
          // should perform a yaw rotation
          // rotate_yaw (min: -20, max: 20, default: 0)
          const yawMin = -40
          const yawMax = 40

          // note: we invert the axis here
          params.rotate_yaw = mapRange(-vector.x, generalControl.minX, generalControl.maxX, yawMin, yawMax);

          // displacing the face vertically by moving the mouse on the Y axis
          // should perform a pitch rotation
          // rotate_pitch (min: -20, max: 20, default: 0)
          const pitchMin = -40
          const pitchMax = 40
          params.rotate_pitch = mapRange(vector.y, eyeControl.minY, eyeControl.maxY, pitchMin, pitchMax);
          break;
        default:
          return
      }
    }

    for (const [key, value] of Object.entries(params)) {
      if (isNaN(value as any) || !isFinite(value as any)) {
        console.log(`${key} is NaN, aborting`)
        return
      }
    }

    //console.log(`PITCH=${params.rotate_pitch || 0}, YAW=${params.rotate_yaw || 0}, ROLL=${params.rotate_roll || 0}`);

    setParams(params)

    try {

      if (originalImageUuid) {
        facePoke.transformImage(originalImageUuid, params);
      }

    } catch (error) {
      // console.error('Error modifying image:', error);
      setError('Failed to modify image');
    }
  }
}))
