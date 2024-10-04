import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateFileName(fileName: string, maxLength: number = 16) {
  if (fileName.length <= maxLength) return fileName;

  const start = fileName.slice(0, maxLength / 2 - 1);
  const end = fileName.slice(-maxLength / 2 + 2);

  return `${start}...${end}`;
};
