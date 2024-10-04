import { create } from 'zustand'
import type { ClosestLandmark } from './useFaceLandmarkDetection'
import type { ImageModificationParams } from '@/lib/facePoke'

interface ImageState {
  error: string
  imageFile: File | null
  originalImage: string
  previewImage: string
  originalImageHash: string
  minLatency: number
  averageLatency: number
  maxLatency: number
  activeLandmark?: ClosestLandmark
  params: Partial<ImageModificationParams>
  setError: (error?: string) => void
  setImageFile: (file: File | null) => void
  setOriginalImage: (url: string) => void
  setOriginalImageHash: (hash: string) => void
  setPreviewImage: (url: string) => void
  resetImage: () => void
  setAverageLatency: (averageLatency: number) => void
  setActiveLandmark: (activeLandmark?: ClosestLandmark) => void
  setParams: (params: Partial<ImageModificationParams>) => void
}

export const useMainStore = create<ImageState>((set, get) => ({
  error: '',
  imageFile: null,
  originalImage: '',
  originalImageHash: '',
  previewImage: '',
  minLatency: 20, // min time between requests
  averageLatency: 190, // this should be the average for most people
  maxLatency: 4000, // max time between requests
  activeLandmark: undefined,
  params: {},
  setError: (error: string = '') => set({ error }),
  setImageFile: (file) => set({ imageFile: file }),
  setOriginalImage: (url) => set({ originalImage: url }),
  setOriginalImageHash: (originalImageHash) => set({ originalImageHash }),
  setPreviewImage: (url) => set({ previewImage: url }),
  resetImage: () => {
    const { originalImage } = get()
    if (originalImage) {
      set({ previewImage: originalImage })
    }
  },
  setAverageLatency: (averageLatency: number) => set({ averageLatency }),
  setActiveLandmark: (activeLandmark?: ClosestLandmark) => set({ activeLandmark }),
  setParams: (params: Partial<ImageModificationParams>) => {
    const {params: previousParams } = get()
    set({ params: {
      ...previousParams,
      ...params
    }})
  },
}))
