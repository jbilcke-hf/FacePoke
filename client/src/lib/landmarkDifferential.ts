import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { ImageModificationParams } from '../types';

interface LandmarkDiff {
  source: NormalizedLandmark[][];
  target: NormalizedLandmark[][];
}

export class LandmarkDifferential {
  // Constants for conversion from landmark differences to transformation parameters
  private static readonly ROTATION_SCALE = 40; // Scale factor for rotation angles
  private static readonly EXPRESSION_SCALE = 100; // Scale factor for expressions

  /**
   * Calculate transformation parameters based on differences between source and target landmarks
   */
  static calculateTransformParams(diff: LandmarkDiff): Partial<ImageModificationParams> {
    const params: Partial<ImageModificationParams> = {};

    if (!diff.source[0] || !diff.target[0]) return params;

    const sourceLandmarks = diff.source[0];
    const targetLandmarks = diff.target[0];

    // Calculate head rotation
    params.rotate_yaw = this.calculateYawRotation(sourceLandmarks, targetLandmarks);
    params.rotate_pitch = this.calculatePitchRotation(sourceLandmarks, targetLandmarks);
    params.rotate_roll = this.calculateRollRotation(sourceLandmarks, targetLandmarks);

    // Calculate facial expressions
    params.eyes = this.calculateEyeOpening(sourceLandmarks, targetLandmarks);
    params.smile = this.calculateSmile(sourceLandmarks, targetLandmarks);
    params.eyebrow = this.calculateEyebrowRaise(sourceLandmarks, targetLandmarks);

    return params;
  }

  /**
   * Calculate yaw rotation from facial landmarks
   * Uses the relative position of nose bridge to face outline
   */
  private static calculateYawRotation(source: NormalizedLandmark[], target: NormalizedLandmark[]): number {
    // Use nose bridge (landmark 6) relative to face outline
    const sourceNose = source[6];
    const targetNose = target[6];

    const diff = (targetNose.x - sourceNose.x);
    return diff * this.ROTATION_SCALE;
  }

  /**
   * Calculate pitch rotation from facial landmarks
   * Uses the vertical position of nose tip relative to face
   */
  private static calculatePitchRotation(source: NormalizedLandmark[], target: NormalizedLandmark[]): number {
    // Use nose tip (landmark 4) vertical position
    const sourceNose = source[4];
    const targetNose = target[4];

    const diff = (targetNose.y - sourceNose.y);
    return diff * this.ROTATION_SCALE;
  }

  /**
   * Calculate roll rotation from facial landmarks
   * Uses the angle between eyes
   */
  private static calculateRollRotation(source: NormalizedLandmark[], target: NormalizedLandmark[]): number {
    // Use angle between eyes (landmarks 33 and 263)
    const sourceAngle = Math.atan2(source[263].y - source[33].y, source[263].x - source[33].x);
    const targetAngle = Math.atan2(target[263].y - target[33].y, target[263].x - target[33].x);

    const diff = (targetAngle - sourceAngle);
    return (diff * 180 / Math.PI) * this.ROTATION_SCALE;
  }

  /**
   * Calculate eye opening parameter from landmarks
   */
  private static calculateEyeOpening(source: NormalizedLandmark[], target: NormalizedLandmark[]): number {
    // Use vertical distance between upper and lower eyelids
    const sourceEyeGap = (source[374].y - source[386].y);
    const targetEyeGap = (target[374].y - target[386].y);

    return ((targetEyeGap - sourceEyeGap) / sourceEyeGap) * this.EXPRESSION_SCALE;
  }

  /**
   * Calculate smile parameter from landmarks
   */
  private static calculateSmile(source: NormalizedLandmark[], target: NormalizedLandmark[]): number {
    // Use mouth corner positions (landmarks 61 and 291)
    const sourceMouthWidth = Math.abs(source[61].x - source[291].x);
    const targetMouthWidth = Math.abs(target[61].x - target[291].x);

    return ((targetMouthWidth - sourceMouthWidth) / sourceMouthWidth) * this.EXPRESSION_SCALE;
  }

  /**
   * Calculate eyebrow raising parameter from landmarks
   */
  private static calculateEyebrowRaise(source: NormalizedLandmark[], target: NormalizedLandmark[]): number {
    // Use distance between eyebrow and eye (landmarks 282 and 374)
    const sourceDistance = Math.abs(source[282].y - source[374].y);
    const targetDistance = Math.abs(target[282].y - target[374].y);

    return ((targetDistance - sourceDistance) / sourceDistance) * this.EXPRESSION_SCALE;
  }
}
