(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  // 三角レーダーの軸角度（度）: 0=上, 1=左下, 2=右下。SVG座標(y下向き)で上=-90°。
  const AXIS_ANGLES = [-90, 150, 30];

  // 値(0-100)と軸番号からSVG座標{x,y}を返す純関数。半径 r' = radius × clamp(value,0,100)/100。
  function radarPoint(value, axisIndex, cx, cy, radius) {
    const v = Math.max(0, Math.min(100, value));
    const r = radius * v / 100;
    const rad = AXIS_ANGLES[axisIndex] * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  DT.radar = { radarPoint, AXIS_ANGLES };
})(typeof window !== 'undefined' ? window : globalThis);
