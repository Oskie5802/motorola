export function interpolateAngle(current, target, rate) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * rate;
}

export function getRampHeightAndSlope(t, rampLength, rampDepth, type) {
  let y = 0;
  let dy_du = 0;
  if (type === 'sine') {
    y = -rampDepth * (1 - Math.sin(t * Math.PI / 2));
    dy_du = (rampDepth / rampLength) * (Math.PI / 2) * Math.cos(t * Math.PI / 2);
  } else {
    y = -rampDepth * (1 - Math.cos(t * Math.PI / 2));
    dy_du = -(rampDepth / rampLength) * (Math.PI / 2) * Math.sin(t * Math.PI / 2);
  }
  const angle = Math.atan(dy_du);
  return { y, angle };
}

export function getVehicleYAndPitch(u, min, max, rampLength, rampDepth, dir) {
  let y = 0;
  let pitch = 0;

  if (dir === 1) {
    if (u < min) {
      const t = Math.max(0, Math.min(1, (u - (min - rampLength)) / rampLength));
      const res = getRampHeightAndSlope(t, rampLength, rampDepth, 'sine');
      y = res.y;
      pitch = -res.angle;
    } else if (u > max) {
      const t = Math.max(0, Math.min(1, (u - max) / rampLength));
      const res = getRampHeightAndSlope(t, rampLength, rampDepth, 'cosine');
      y = res.y;
      pitch = -res.angle;
    }
  } else {
    if (u > max) {
      const t = Math.max(0, Math.min(1, ((max + rampLength) - u) / rampLength));
      const res = getRampHeightAndSlope(t, rampLength, rampDepth, 'sine');
      y = res.y;
      pitch = -res.angle;
    } else if (u < min) {
      const t = Math.max(0, Math.min(1, (min - u) / rampLength));
      const res = getRampHeightAndSlope(t, rampLength, rampDepth, 'cosine');
      y = res.y;
      pitch = -res.angle;
    }
  }

  return { y, pitch };
}
