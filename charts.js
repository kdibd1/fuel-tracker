(() => {
'use strict';

/*
 * Fuel Tracker — chart drawing
 *
 * Owns:
 * - vehicle consumption chart
 * - Kuttabul fuel price chart
 */

const FT =
  window.FuelTracker =
  window.FuelTracker || {};

const $ =
  FT.$ ||
  (id =>
    document.getElementById(id));

const num =
  FT.num ||
  ((n, d = 1) =>
    Number(n).toFixed(d));


/* --------------------
   GENERIC LINE CHART
-------------------- */

function lineChart(
  id,
  values,
  labels = null,
  emptyText = 'No data yet'
) {
  const c = $(id);

  if (!c) return;

  const ctx =
    c.getContext('2d');

  const rect =
    c.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio || 1;

  const w =
    Math.max(
      300,
      Math.floor(
        rect.width || 300
      )
    );

  const h =
    Math.max(
      180,
      Math.floor(
        rect.height || 220
      )
    );

  c.width =
    w * dpr;

  c.height =
    h * dpr;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    w,
    h
  );

  const vals =
    values.filter(
      Number.isFinite
    );

  if (!vals.length) {
    ctx.font =
      '14px system-ui, sans-serif';

    ctx.fillStyle =
      'rgba(255,255,255,.55)';

    ctx.textAlign =
      'center';

    ctx.fillText(
      emptyText,
      w / 2,
      h / 2
    );

    return;
  }

  const pad = {
    l: 46,
    r: 18,
    t: 18,
    b: 34
  };

  let min =
    Math.min(...vals);

  let max =
    Math.max(...vals);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const range =
    max - min;

  min -= range * 0.12;
  max += range * 0.12;

  const innerW =
    w - pad.l - pad.r;

  const innerH =
    h - pad.t - pad.b;

  const x =
    i =>
      pad.l +
      (
        vals.length === 1
          ? innerW / 2
          : i /
            (vals.length - 1) *
            innerW
      );

  const y =
    v =>
      pad.t +
      (max - v) /
      (max - min) *
      innerH;

  ctx.strokeStyle =
    'rgba(255,255,255,.10)';

  ctx.lineWidth = 1;

  ctx.fillStyle =
    'rgba(255,255,255,.55)';

  ctx.font =
    '11px system-ui, sans-serif';

  ctx.textAlign =
    'right';

  for (
    let i = 0;
    i <= 4;
    i++
  ) {
    const yy =
      pad.t +
      innerH *
      i / 4;

    const val =
      max -
      (max - min) *
      i / 4;

    ctx.beginPath();

    ctx.moveTo(
      pad.l,
      yy
    );

    ctx.lineTo(
      w - pad.r,
      yy
    );

    ctx.stroke();

    ctx.fillText(
      num(val, 1),
      pad.l - 7,
      yy + 4
    );
  }

  ctx.strokeStyle =
    '#31d17c';

  ctx.lineWidth =
    2.5;

  ctx.lineJoin =
    'round';

  ctx.lineCap =
    'round';

  ctx.beginPath();

  vals.forEach(
    (v, i) => {
      if (i === 0) {
        ctx.moveTo(
          x(i),
          y(v)
        );
      } else {
        ctx.lineTo(
          x(i),
          y(v)
        );
      }
    }
  );

  ctx.stroke();

  ctx.fillStyle =
    '#31d17c';

  vals.forEach(
    (v, i) => {
      ctx.beginPath();

      ctx.arc(
        x(i),
        y(v),
        3.5,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  );

  if (
    labels &&
    labels.length ===
      vals.length
  ) {
    ctx.fillStyle =
      'rgba(255,255,255,.45)';

    ctx.font =
      '10px system-ui, sans-serif';

    ctx.textAlign =
      'center';

    const indexes =
      vals.length <= 4
        ? vals.map(
            (_, i) => i
          )
        : [
            0,

            Math.floor(
              (vals.length - 1) /
              2
            ),

            vals.length - 1
          ];

    [
      ...new Set(indexes)
    ].forEach(
      i => {
        ctx.fillText(
          labels[i],
          x(i),
          h - 10
        );
      }
    );
  }
}


/* --------------------
   FUEL PRICE CHART
-------------------- */

function drawFuelChart(
  rows
) {
  const valid =
    rows.filter(
      x =>
        Number.isFinite(
          x.price
        ) &&
        x.price > 0 &&
        x.price < 900
    );

  const diesel =
    valid
      .filter(
        x =>
          x.fuel ===
          'Diesel'
      )
      .slice(-30);

  const u91 =
    valid
      .filter(
        x =>
          x.fuel ===
          'U91'
      )
      .slice(-30);

  const all = [
    ...diesel.map(
      x => x.price
    ),

    ...u91.map(
      x => x.price
    )
  ];

  const c =
    $('fuelChart');

  if (!c) return;

  const ctx =
    c.getContext('2d');

  const rect =
    c.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio ||
    1;

  const w =
    Math.max(
      300,
      Math.floor(
        rect.width || 300
      )
    );

  const h =
    Math.max(
      200,
      Math.floor(
        rect.height || 240
      )
    );

  c.width =
    w * dpr;

  c.height =
    h * dpr;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    w,
    h
  );

  if (!all.length) {
    ctx.fillStyle =
      'rgba(255,255,255,.55)';

    ctx.font =
      '14px system-ui, sans-serif';

    ctx.textAlign =
      'center';

    ctx.fillText(
      'Fuel price history appears here',
      w / 2,
      h / 2
    );

    return;
  }

  const pad = {
    l: 48,
    r: 18,
    t: 22,
    b: 38
  };

  let min =
    Math.min(...all);

  let max =
    Math.max(...all);

  if (min === max) {
    min -= 5;
    max += 5;
  }

  const range =
    max - min;

  min -= range * 0.15;
  max += range * 0.15;

  const innerW =
    w - pad.l - pad.r;

  const innerH =
    h - pad.t - pad.b;

  const y =
    v =>
      pad.t +
      (max - v) /
      (max - min) *
      innerH;

  ctx.strokeStyle =
    'rgba(255,255,255,.10)';

  ctx.fillStyle =
    'rgba(255,255,255,.55)';

  ctx.font =
    '11px system-ui, sans-serif';

  ctx.textAlign =
    'right';

  for (
    let i = 0;
    i <= 4;
    i++
  ) {
    const yy =
      pad.t +
      innerH *
      i / 4;

    const val =
      max -
      (max - min) *
      i / 4;

    ctx.beginPath();

    ctx.moveTo(
      pad.l,
      yy
    );

    ctx.lineTo(
      w - pad.r,
      yy
    );

    ctx.stroke();

    ctx.fillText(
      num(val, 1),
      pad.l - 7,
      yy + 4
    );
  }

  function series(
    seriesRows,
    stroke,
    label,
    labelX
  ) {
    if (!seriesRows.length) {
      return;
    }

    const x =
      i =>
        pad.l +
        (
          seriesRows.length === 1
            ? innerW / 2
            : i /
              (
                seriesRows.length -
                1
              ) *
              innerW
        );

    ctx.strokeStyle =
      stroke;

    ctx.fillStyle =
      stroke;

    ctx.lineWidth =
      2.5;

    ctx.lineJoin =
      'round';

    ctx.lineCap =
      'round';

    ctx.beginPath();

    seriesRows.forEach(
      (row, i) => {
        if (i === 0) {
          ctx.moveTo(
            x(i),
            y(row.price)
          );
        } else {
          ctx.lineTo(
            x(i),
            y(row.price)
          );
        }
      }
    );

    ctx.stroke();

    seriesRows.forEach(
      (row, i) => {
        ctx.beginPath();

        ctx.arc(
          x(i),
          y(row.price),
          3,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    );

    ctx.font =
      '11px system-ui, sans-serif';

    ctx.textAlign =
      'left';

    ctx.fillText(
      label,
      labelX,
      14
    );
  }

  series(
    diesel,
    '#31d17c',
    'Diesel',
    pad.l
  );

  series(
    u91,
    '#5da9ff',
    'U91',
    pad.l + 58
  );
}


/* --------------------
   PUBLIC INTERFACE
-------------------- */

FT.lineChart =
  lineChart;

FT.drawFuelChart =
  drawFuelChart;

})();
