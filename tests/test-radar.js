'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/radar.js');
const DT = globalThis.DT;
const near = (a, b) => Math.abs(a - b) < 0.001;

test('radarPoint: value=0はどの軸でも中心(cx,cy)に一致', () => {
  [0, 1, 2].forEach(axis => {
    const p = DT.radar.radarPoint(0, axis, 50, 50, 40);
    assert.ok(near(p.x, 50) && near(p.y, 50), 'axis=' + axis);
  });
});

test('radarPoint: value=100・軸0(上)は(cx, cy-radius)', () => {
  const p = DT.radar.radarPoint(100, 0, 50, 50, 40);
  assert.ok(near(p.x, 50), 'x=' + p.x);
  assert.ok(near(p.y, 10), 'y=' + p.y); // 50-40
});

test('radarPoint: 軸1(左下)と軸2(右下)はxがcx対称・yが等しく下側(y>cy)', () => {
  const p1 = DT.radar.radarPoint(100, 1, 50, 50, 40);
  const p2 = DT.radar.radarPoint(100, 2, 50, 50, 40);
  assert.ok(near(p1.x - 50, -(p2.x - 50)), 'x対称: ' + p1.x + ',' + p2.x);
  assert.ok(near(p1.y, p2.y), 'y等しい: ' + p1.y + ',' + p2.y);
  assert.ok(p1.y > 50, '下側なのでy>cy: ' + p1.y);
});

test('radarPoint: value>100や負値はクランプされる', () => {
  const over = DT.radar.radarPoint(200, 0, 50, 50, 40);
  assert.ok(near(over.y, 10), '200は100扱い y=' + over.y);
  const under = DT.radar.radarPoint(-50, 0, 50, 50, 40);
  assert.ok(near(under.y, 50), '負値は0扱い y=' + under.y);
});

summary();
