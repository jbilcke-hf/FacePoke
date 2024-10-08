import * as vision from '@mediapipe/tasks-vision';

/**
 * Represents the parameters for image modification.
 */
export interface ImageModificationParams {
  eyes: number;
  eyebrow: number;
  wink: number;
  pupil_x: number;
  pupil_y: number;
  aaa: number;
  eee: number;
  woo: number;
  smile: number;
  rotate_pitch: number;
  rotate_yaw: number;
  rotate_roll: number;
}

export interface Metadata {
  center: number[] //center - 2x1
  size: number // size - scalar
  bbox: number[][] // bbox - 4x2
  angle: number   //angle - rad, counterclockwise
}

/**
 * Represents a message to modify an image.
 */
export interface ModifyImageMessage {
  image?: string;
  uuid?: string;
  params: Partial<ImageModificationParams>;
}

export type OnServerResponseParams = {
  image?: Blob
  error?: string
  loaded?: {
    i: string
  } & {
    c: number[] //center - 2x1
    s: number // size - scalar
    b: number[][] // bbox - 4x2
    a: number // angle - rad, counterclockwise
  }
}

/**
 * Callback type for handling modified images.
 */
export type OnServerResponse = (params: OnServerResponseParams) => Promise<void>;

/**
 * Enum representing the different states of a WebSocket connection.
 */
export enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3
}

export type ActionMode = 'HOVERING' | 'PRIMARY' | 'SECONDARY'
export type LandmarkGroup = 'lips' | 'leftEye' | 'leftEyebrow' | 'rightEye' | 'rightEyebrow' | 'faceOval' | 'background';
export type LandmarkCenter = { x: number; y: number; z: number };
export type ClosestLandmark = { group: LandmarkGroup; distance: number; vector: { x: number; y: number; z: number } };

export type MediaPipeResources = {
  faceLandmarker: vision.FaceLandmarker | null;
  drawingUtils: vision.DrawingUtils | null;
};

export interface ImageStateValues {
  status: string
  error: string
  imageFile: File | null
  isFollowingCursor: boolean
  isGazingAtCursor: boolean
  originalImage: string
  previewImage: string
  originalImageUuid: string
  minLatency: number
  averageLatency: number
  maxLatency: number
  activeLandmark?: ClosestLandmark
  metadata: Metadata
  params: Partial<ImageModificationParams>
  faceLandmarks: vision.NormalizedLandmark[][]
  blendShapes: vision.Classifications[]
}
