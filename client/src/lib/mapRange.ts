// Function to map a value from one range to another
export const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
  return Math.min(outMax, Math.max(outMin, ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin));
};
