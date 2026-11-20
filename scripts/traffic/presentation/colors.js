export const hex = (css) => parseInt(css.replace("#", ""), 16);
export const PALETTE = {
  road: 0x3a3d44,
  junction: 0x41444c,
  marking: 0xe8e2c0,
  stopLine: 0xf2f2f2,
  light: [0xe5484d, 0xf2c744, 0x46c46a], // indexed by LightState
  lightOff: 0x20232a,
  inputGate: 0x46c46a,
  outputGate: 0xe5484d,
  hazard: 0xff8a1f,
};
