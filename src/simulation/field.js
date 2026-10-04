// Positions in the AI are stored as fractions of the playing surface so the
// geometry is resolution independent. Physics scales those fractions against
// the larger world dimensions below.
export const FIELD_DIMENSIONS = Object.freeze({
  length: 132,
  width: 74,
  referenceLength: 100,
  referenceWidth: 56,
  scaleX: 100 / 132,
  scaleY: 56 / 74,
  passDistanceScale: 132 / 100,
});
