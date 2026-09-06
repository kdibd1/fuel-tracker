(() => {
'use strict';

/*
 * Fuel Tracker — chart drawing
 *
 * Owns:
 * - vehicle consumption chart
 * - Kuttabul fuel price chart
 * - fuel graph hover/tap interaction
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


/* =========================================================
   GENERIC VEHICLE LINE CHART
========================================================= */

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


/* =========================================================
   KUTTABUL FUEL GRAPH STATE
========================================================= */

const fuelChartState = {
  rows: [],
  points: [],
  selectedKey: null,
  hoverKey: null
};


/* =========================================================
   DATE / TIME HELPERS
========================================================= */

function rowTime(row) {
  /*
   * api_time_utc is preferred because
   * it represents the price timestamp
   * supplied by the fuel-price feed.
   *
   * checked_utc is only a fallback.
   */
  const raw =
    row.api ||
    row.checked;

  const d =
    new Date(raw);

  return Number.isNaN(
    d.getTime()
  )
    ? null
    : d;
}

function pointKey(row) {
  return [
    row.fuel,
    row.api || row.checked || '',
    row.price
  ].join('|');
}

function shortDate(date) {
  return date.toLocaleDateString(
    'en-AU',
    {
      timeZone:
        'Australia/Brisbane',

      day:
        'numeric',

      month:
        'short'
    }
  );
}

function exactDateTime(date) {
  return date.toLocaleString(
    'en-AU',
    {
      timeZone:
        'Australia/Brisbane',

      day:
        'numeric',

      month:
        'short',

      year:
        'numeric',

      hour:
        'numeric',

      minute:
        '2-digit'
    }
  );
}


/* =========================================================
   FIND NEAREST INTERACTIVE POINT
========================================================= */

function nearestFuelPoint(
  x,
  y,
  maxDistance = 18
) {
  let best = null;
  let bestDistance =
    maxDistance;

  for (
    const p of
    fuelChartState.points
  ) {
    const dx =
      p.x - x;

    const dy =
      p.y - y;

    const distance =
      Math.sqrt(
        dx * dx +
        dy * dy
      );

    if (
      distance <=
      bestDistance
    ) {
      best =
        p;

      bestDistance =
        distance;
    }
  }

  return best;
}


/* =========================================================
   CANVAS POINTER POSITION
========================================================= */

function canvasPosition(
  canvas,
  event
) {
  const rect =
    canvas
      .getBoundingClientRect();

  return {
    x:
      event.clientX -
      rect.left,

    y:
      event.clientY -
      rect.top
  };
}


/* =========================================================
   BIND FUEL GRAPH INTERACTION
========================================================= */

function bindFuelChartEvents(
  canvas
) {
  if (
    canvas.dataset
      .fuelEventsBound ===
    'true'
  ) {
    return;
  }

  canvas.dataset
    .fuelEventsBound =
    'true';


  /*
   * Laptop / mouse:
   * hover over a point.
   */
  canvas.addEventListener(
    'pointermove',
    event => {
      if (
        event.pointerType &&
        event.pointerType !==
          'mouse'
      ) {
        return;
      }

      const pos =
        canvasPosition(
          canvas,
          event
        );

      const p =
        nearestFuelPoint(
          pos.x,
          pos.y,
          15
        );

      const key =
        p
          ? p.key
          : null;

      if (
        key !==
        fuelChartState.hoverKey
      ) {
        fuelChartState.hoverKey =
          key;

        drawFuelChart(
          fuelChartState.rows
        );
      }

      canvas.style.cursor =
        p
          ? 'pointer'
          : 'default';
    }
  );


  canvas.addEventListener(
    'pointerleave',
    event => {
      if (
        event.pointerType &&
        event.pointerType !==
          'mouse'
      ) {
        return;
      }

      if (
        fuelChartState.hoverKey
      ) {
        fuelChartState.hoverKey =
          null;

        drawFuelChart(
          fuelChartState.rows
        );
      }

      canvas.style.cursor =
        'default';
    }
  );


  /*
   * Phone:
   * tap a point.
   *
   * Laptop:
   * click locks the point
   * on screen as well.
   */
  canvas.addEventListener(
    'pointerup',
    event => {
      const pos =
        canvasPosition(
          canvas,
          event
        );

      const p =
        nearestFuelPoint(
          pos.x,
          pos.y,
          20
        );

      if (p) {
        fuelChartState.selectedKey =
          p.key;
      } else {
        fuelChartState.selectedKey =
          null;
      }

      drawFuelChart(
        fuelChartState.rows
      );
    }
  );
}


/* =========================================================
   TOOLTIP
========================================================= */

function drawFuelTooltip(
  ctx,
  point,
  w,
  h
) {
  if (!point) {
    return;
  }

  const title =
    `${point.row.fuel} — ` +
    `${num(
      point.row.price,
      1
    )} c/L`;

  const time =
    exactDateTime(
      point.time
    );

  ctx.font =
    '600 13px system-ui, sans-serif';

  const titleWidth =
    ctx.measureText(
      title
    ).width;

  ctx.font =
    '12px system-ui, sans-serif';

  const timeWidth =
    ctx.measureText(
      time
    ).width;

  const boxWidth =
    Math.max(
      titleWidth,
      timeWidth
    ) + 24;

  const boxHeight =
    56;

  let boxX =
    point.x -
    boxWidth / 2;

  let boxY =
    point.y -
    boxHeight -
    16;


  /*
   * Keep tooltip inside chart.
   */
  boxX =
    Math.max(
      6,
      Math.min(
        boxX,
        w -
        boxWidth -
        6
      )
    );

  if (
    boxY < 6
  ) {
    boxY =
      point.y + 16;
  }

  if (
    boxY +
    boxHeight >
    h - 4
  ) {
    boxY =
      h -
      boxHeight -
      4;
  }


  /*
   * Tooltip box.
   */
  ctx.fillStyle =
    'rgba(7,16,29,.96)';

  ctx.strokeStyle =
    point.stroke;

  ctx.lineWidth =
    1.5;

  ctx.beginPath();

  if (
    typeof ctx.roundRect ===
    'function'
  ) {
    ctx.roundRect(
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      8
    );
  } else {
    ctx.rect(
      boxX,
      boxY,
      boxWidth,
      boxHeight
    );
  }

  ctx.fill();
  ctx.stroke();


  /*
   * Tooltip title.
   */
  ctx.fillStyle =
    '#ffffff';

  ctx.font =
    '600 13px system-ui, sans-serif';

  ctx.textAlign =
    'left';

  ctx.fillText(
    title,
    boxX + 12,
    boxY + 22
  );


  /*
   * Exact Queensland
   * date + time.
   */
  ctx.fillStyle =
    'rgba(255,255,255,.68)';

  ctx.font =
    '12px system-ui, sans-serif';

  ctx.fillText(
    time,
    boxX + 12,
    boxY + 42
  );
}


/* =========================================================
   FUEL PRICE CHART
========================================================= */

function drawFuelChart(
  rows
) {
  fuelChartState.rows =
    Array.isArray(rows)
      ? rows.slice()
      : [];

  const c =
    $('fuelChart');

  if (!c) {
    return;
  }

  bindFuelChartEvents(c);

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
      220,
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


  /* --------------------
     CLEAN + SORT ROWS
  -------------------- */

  const valid =
    fuelChartState.rows
      .map(row => ({
        row,
        time:
          rowTime(row)
      }))
      .filter(
        x =>
          x.time &&
          (
            x.row.fuel ===
              'Diesel' ||
            x.row.fuel ===
              'U91'
          ) &&
          Number.isFinite(
            x.row.price
          ) &&
          x.row.price > 0 &&
          x.row.price < 900
      )
      .sort(
        (a, b) =>
          a.time -
          b.time
      );


  /*
   * Preserve roughly the same
   * amount of history as before:
   * latest 30 points per fuel.
   */
  const diesel =
    valid
      .filter(
        x =>
          x.row.fuel ===
          'Diesel'
      )
      .slice(-30);

  const u91 =
    valid
      .filter(
        x =>
          x.row.fuel ===
          'U91'
      )
      .slice(-30);

  const shown =
    [
      ...diesel,
      ...u91
    ]
      .sort(
        (a, b) =>
          a.time -
          b.time
      );


  fuelChartState.points =
    [];


  /* --------------------
     EMPTY GRAPH
  -------------------- */

  if (!shown.length) {
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


  /* --------------------
     GRAPH DIMENSIONS
  -------------------- */

  const pad = {
    l: 50,
    r: 18,
    t: 26,
    b: 42
  };

  const innerW =
    w -
    pad.l -
    pad.r;

  const innerH =
    h -
    pad.t -
    pad.b;


  /* --------------------
     PRICE RANGE
  -------------------- */

  const prices =
    shown.map(
      x => x.row.price
    );

  let minPrice =
    Math.min(...prices);

  let maxPrice =
    Math.max(...prices);

  if (
    minPrice ===
    maxPrice
  ) {
    minPrice -= 5;
    maxPrice += 5;
  }

  const priceRange =
    maxPrice -
    minPrice;

  minPrice -=
    priceRange *
    0.15;

  maxPrice +=
    priceRange *
    0.15;


  /* --------------------
     SHARED TIME RANGE
  -------------------- */

  let minTime =
    Math.min(
      ...shown.map(
        x =>
          x.time.getTime()
      )
    );

  let maxTime =
    Math.max(
      ...shown.map(
        x =>
          x.time.getTime()
      )
    );

  if (
    minTime ===
    maxTime
  ) {
    minTime -=
      60 * 60 * 1000;

    maxTime +=
      60 * 60 * 1000;
  }


  /*
   * Both Diesel and U91 now
   * use THIS same X scale.
   */
  const x =
    time =>
      pad.l +
      (
        (
          time.getTime() -
          minTime
        ) /
        (
          maxTime -
          minTime
        )
      ) *
      innerW;

  const y =
    price =>
      pad.t +
      (
        maxPrice -
        price
      ) /
      (
        maxPrice -
        minPrice
      ) *
      innerH;


  /* =====================================================
     Y GRID / PRICE LABELS
  ===================================================== */

  ctx.lineWidth =
    1;

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

    const price =
      maxPrice -
      (
        maxPrice -
        minPrice
      ) *
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
      num(price, 1),
      pad.l - 7,
      yy + 4
    );
  }


  /* =====================================================
     X AXIS DATE LABELS
  ===================================================== */

  const timeLabels = [
    minTime,
    minTime +
      (
        maxTime -
        minTime
      ) / 2,
    maxTime
  ];

  ctx.fillStyle =
    'rgba(255,255,255,.48)';

  ctx.font =
    '10px system-ui, sans-serif';

  timeLabels.forEach(
    (timeValue, i) => {
      const date =
        new Date(
          timeValue
        );

      const xx =
        pad.l +
        innerW *
        i / 2;

      if (i === 0) {
        ctx.textAlign =
          'left';
      } else if (
        i === 2
      ) {
        ctx.textAlign =
          'right';
      } else {
        ctx.textAlign =
          'center';
      }

      ctx.fillText(
        shortDate(date),
        xx,
        h - 12
      );
    }
  );


  /* =====================================================
     DRAW ONE FUEL SERIES
  ===================================================== */

  function series(
    seriesRows,
    stroke
  ) {
    if (!seriesRows.length) {
      return;
    }

    ctx.strokeStyle =
      stroke;

    ctx.lineWidth =
      2.5;

    ctx.lineJoin =
      'round';

    ctx.lineCap =
      'round';

    ctx.beginPath();

    seriesRows.forEach(
      (item, i) => {
        const xx =
          x(item.time);

        const yy =
          y(
            item.row.price
          );

        if (i === 0) {
          ctx.moveTo(
            xx,
            yy
          );
        } else {
          ctx.lineTo(
            xx,
            yy
          );
        }
      }
    );

    ctx.stroke();


    /*
     * Store actual coordinates
     * so pointer/tap detection
     * knows where every point is.
     */
    seriesRows.forEach(
      item => {
        const xx =
          x(item.time);

        const yy =
          y(
            item.row.price
          );

        const key =
          pointKey(
            item.row
          );

        fuelChartState
          .points
          .push({
            x:
              xx,

            y:
              yy,

            key,

            row:
              item.row,

            time:
              item.time,

            stroke
          });


        /*
         * Normal point.
         */
        ctx.fillStyle =
          stroke;

        ctx.beginPath();

        ctx.arc(
          xx,
          yy,
          3.5,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    );
  }


  series(
    diesel,
    '#31d17c'
  );

  series(
    u91,
    '#5da9ff'
  );


  /* =====================================================
     ACTIVE / SELECTED POINT
  ===================================================== */

  const activeKey =
    fuelChartState
      .selectedKey ||
    fuelChartState
      .hoverKey;

  const activePoint =
    activeKey
      ? fuelChartState
          .points
          .find(
            p =>
              p.key ===
              activeKey
          )
      : null;

  if (activePoint) {

    /*
     * Vertical reference line.
     */
    ctx.strokeStyle =
      'rgba(255,255,255,.20)';

    ctx.lineWidth =
      1;

    ctx.setLineDash(
      [4, 4]
    );

    ctx.beginPath();

    ctx.moveTo(
      activePoint.x,
      pad.t
    );

    ctx.lineTo(
      activePoint.x,
      h - pad.b
    );

    ctx.stroke();

    ctx.setLineDash([]);


    /*
     * Highlight ring.
     */
    ctx.fillStyle =
      '#07101d';

    ctx.strokeStyle =
      activePoint.stroke;

    ctx.lineWidth =
      3;

    ctx.beginPath();

    ctx.arc(
      activePoint.x,
      activePoint.y,
      7,
      0,
      Math.PI * 2
    );

    ctx.fill();
    ctx.stroke();


    /*
     * Centre of selected point.
     */
    ctx.fillStyle =
      activePoint.stroke;

    ctx.beginPath();

    ctx.arc(
      activePoint.x,
      activePoint.y,
      3,
      0,
      Math.PI * 2
    );

    ctx.fill();


    drawFuelTooltip(
      ctx,
      activePoint,
      w,
      h
    );
  }
}


/* =========================================================
   PUBLIC INTERFACE
========================================================= */

FT.lineChart =
  lineChart;

FT.drawFuelChart =
  drawFuelChart;

})();
