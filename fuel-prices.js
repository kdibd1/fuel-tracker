(() => {
'use strict';

/*
 * Fuel Tracker — Kuttabul fuel prices
 *
 * Owns:
 * - fuel_status.json
 * - fuel_history.csv
 * - current Diesel/U91 display
 * - unavailable fuel handling
 * - fuel graph data
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

let fuelRows = [];


/* Kuttabul shell navigation; the home graph stays in its original place. */
$('openKuttabul').addEventListener('click', () => {
  $('picker').classList.add('hidden');
  $('kuttabulDashboard').classList.remove('hidden');
  renderKuttabul();
  $('backKuttabul').focus({ preventScroll: true });
  window.scrollTo(0, 0);
});

$('backKuttabul').addEventListener('click', () => {
  FT.picker();
  // Redraw at the visible size, including after a resize while away.
  drawFuel();
  $('openKuttabul').focus({ preventScroll: true });
  window.scrollTo(0, 0);
});


/* --------------------
   LOAD FUEL DATA
-------------------- */

async function loadFuel() {
  $('fuelUpdated').textContent =
    'Loading prices…';
  renderKuttabul();

  try {
    let statusData = null;

    /*
     * Current availability/status.
     *
     * Failure here does not stop
     * historical prices loading.
     */
    try {
      const sr =
        await fetch(
          'fuel_status.json?' +
          Date.now(),
          {
            cache: 'no-store'
          }
        );

      if (sr.ok) {
        statusData =
          await sr.json();
      }

    } catch (e) {
      console.warn(
        'Fuel status unavailable',
        e
      );
    }


    /*
     * Historical genuine prices.
     */
    const r =
      await fetch(
        'fuel_history.csv?' +
        Date.now(),
        {
          cache: 'no-store'
        }
      );

    if (!r.ok) {
      throw Error(
        'Could not load fuel history'
      );
    }

    const text =
      await r.text();

    const lines =
      text
        .trim()
        .split(/\r?\n/);

    if (lines.length < 2) {
      throw Error(
        'No fuel history'
      );
    }

    const head =
      lines[0]
        .split(',')
        .map(
          x => x.trim()
        );

    const index =
      name =>
        head.indexOf(name);


    /* --------------------
       PARSE HISTORY
    -------------------- */

    fuelRows =
      lines
        .slice(1)
        .map(
          line => {
            const p =
              line
                .split(',')
                .map(
                  x => x.trim()
                );

            return {
              checked:
                p[
                  index(
                    'checked_utc'
                  )
                ],

              api:
                p[
                  index(
                    'api_time_utc'
                  )
                ],

              fuel:
                p[
                  index(
                    'fuel'
                  )
                ],

              price:
                +p[
                  index(
                    'price_cents'
                  )
                ]
            };
          }
        )
        .filter(
          x =>
            x.fuel &&
            Number.isFinite(
              x.price
            ) &&
            x.price > 0 &&
            x.price < 900
        );


    /* --------------------
       LATEST VALID PRICE
    -------------------- */

    const latestValid =
      fuel =>
        fuelRows
          .filter(
            x =>
              x.fuel === fuel
          )
          .sort(
            (a, b) =>
              new Date(b.api) -
              new Date(a.api)
          )[0];


    /* --------------------
       CURRENT PRICE BOX
    -------------------- */

    function showCurrent(
      id,
      fuelName
    ) {
      const info =
        statusData &&
        statusData.fuels
          ? statusData
              .fuels[fuelName]
          : null;

      /*
       * Explicitly unavailable
       * from fuel_status.json.
       */
      if (
        info &&
        info.available === false
      ) {
        $(id).textContent =
          'Unavailable';

        return;
      }

      /*
       * Current valid status price.
       */
      if (
        info &&
        info.available === true &&
        Number.isFinite(
          +info.price_cents
        ) &&
        +info.price_cents > 0 &&
        +info.price_cents < 900
      ) {
        $(id).textContent =
          num(
            +info.price_cents,
            1
          ) +
          ' c/L';

        return;
      }

      /*
       * If status file isn't
       * available, fall back to
       * latest genuine history.
       */
      const fallback =
        latestValid(
          fuelName
        );

      $(id).textContent =
        fallback
          ? num(
              fallback.price,
              1
            ) +
            ' c/L'
          : '—';
    }

    showCurrent(
      'dieselPrice',
      'Diesel'
    );

    showCurrent(
      'u91Price',
      'U91'
    );


    /* --------------------
       STATUS UPDATE TIME
    -------------------- */

    let updated = null;

    if (
      statusData &&
      statusData.checked_utc
    ) {
      updated =
        new Date(
          statusData.checked_utc
        );
    }

    if (
      !updated ||
      Number.isNaN(
        updated.getTime()
      )
    ) {
      const latest =
        fuelRows
          .slice()
          .sort(
            (a, b) =>
              new Date(b.api) -
              new Date(a.api)
          )[0];

      if (latest) {
        updated =
          new Date(
            latest.api
          );
      }
    }

    if (
      updated &&
      !Number.isNaN(
        updated.getTime()
      )
    ) {
      $('fuelUpdated')
        .textContent =
          'Last fuel status update ' +
          updated
            .toLocaleString(
              'en-AU',
              {
                timeZone:
                  'Australia/Brisbane',

                day:
                  'numeric',

                month:
                  'short',

                hour:
                  'numeric',

                minute:
                  '2-digit'
              }
            );

    } else {
      $('fuelUpdated')
        .textContent =
          'Fuel prices loaded';
    }

    drawFuel();

  } catch (e) {
    console.error(e);

    $('dieselPrice')
      .textContent =
        '—';

    $('u91Price')
      .textContent =
        '—';

    $('fuelUpdated')
      .textContent =
        'Fuel history unavailable';

    fuelRows = [];

    drawFuel();
  }
}


/* --------------------
   DRAW FUEL GRAPH
-------------------- */

function drawFuel() {
  renderKuttabul();
  if (
    typeof FT.drawFuelChart ===
    'function'
  ) {
    FT.drawFuelChart(
      fuelRows
    );
  }
}


/* --------------------
   REFRESH BUTTON
-------------------- */

/*
 * IMPORTANT:
 *
 * This only reloads the files
 * already published on GitHub
 * Pages.
 *
 * It does NOT call the Queensland
 * government API and does NOT
 * trigger GitHub Actions.
 */

function bindFuelRefresh() {
  const button =
    $('refreshFuel');

  if (!button) {
    return;
  }

  button.onclick =
    async () => {
      button.disabled =
        true;

      try {
        await loadFuel();

      } finally {
        button.disabled =
          false;
      }
    };
}



/* Independent dashboard range; home chart keeps its existing data and selection. */
let selectedRange = '30D';
const rangeNames = { '7D': 'Past 7 days', '30D': 'Past 30 days', '3M': 'Past 90 days', 'ALL': 'All recorded history' };
const rangeDays = { '7D': 7, '30D': 30, '3M': 90 };

function historyTime(row) {
  const api = Date.parse(row.api);
  return Number.isFinite(api) ? api : Date.parse(row.checked);
}

function periodRows(now = Date.now()) {
  const cutoff = selectedRange === 'ALL' ? -Infinity : now - rangeDays[selectedRange] * 86400000;
  return fuelRows.filter(row => {
    const time = historyTime(row);
    return time >= cutoff && time <= now && Number.isFinite(row.price) && row.price > 0 && row.price < 900;
  });
}

function assessmentMarkup(fuel, label, priceId, rows) {
  const samples = rows.filter(row => row.fuel === fuel);
  const currentText = $(priceId).textContent;
  const current = parseFloat(currentText);
  const prices = samples.map(row => row.price);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  let badge = 'Not enough history', tone = '', detail = 'More recorded prices are needed for a comparison.';
  if (!Number.isFinite(current)) {
    badge = currentText === 'Unavailable' ? 'Unavailable' : 'Current price unavailable';
    detail = 'Historical statistics remain available when recorded.';
  } else if (!samples.length) {
    detail = 'No recorded prices in this period. Try a longer range.';
  } else if (new Set(samples.map(historyTime)).size >= 2) {
    const position = high === low ? null : (current - low) / (high - low);
    badge = position === null ? (current < low ? 'Cheap' : current > high ? 'Expensive' : 'Steady') : position <= 0.25 ? 'Cheap' : position >= 0.75 ? 'Expensive' : 'Average';
    tone = badge.toLowerCase();
    const difference = current - low;
    detail = Math.abs(difference) < 0.05 ? 'Currently at the recorded period low.' : num(Math.abs(difference), 1) + 'c ' + (difference > 0 ? 'above' : 'below') + ' the recorded period low.';
  }
  const value = n => n === null ? '—' : num(n, 1);
  // Only fixed labels and validated numbers are included in this markup.
  const displayPrice = Number.isFinite(current) ? num(current, 1) + ' c/L' : currentText === 'Unavailable' ? 'Unavailable' : '—';
  return '<section class="card"><h2>' + label + '</h2><strong class="fuel-current">' + displayPrice + '</strong><span class="fuel-badge ' + tone + '">' + badge + '</span><p class="muted">' + detail + '</p><dl><div><dt>Low · c/L</dt><dd>' + value(low) + '</dd></div><div><dt>Average · c/L</dt><dd>' + value(avg) + '</dd></div><div><dt>High · c/L</dt><dd>' + value(high) + '</dd></div></dl><p class="muted">' + samples.length + ' logged price' + (samples.length === 1 ? '' : 's') + ' in this period.</p></section>';
}

function renderKuttabul() {
  if ($('kuttabulDashboard').classList.contains('hidden')) return;
  const rows = periodRows();
  $('kuttabulUpdated').textContent = $('fuelUpdated').textContent;
  $('kuttabulPeriod').textContent = rangeNames[selectedRange] + ' · graph shows recorded points within this period';
  $('kuttabulStats').innerHTML = assessmentMarkup('Diesel', 'Diesel', 'dieselPrice', rows) + assessmentMarkup('U91', 'Unleaded 91', 'u91Price', rows);
  FT.drawKuttabulChart(rows);
}

document.querySelectorAll('[data-fuel-range]').forEach(button => {
  button.addEventListener('click', () => {
    selectedRange = button.dataset.fuelRange;
    document.querySelectorAll('[data-fuel-range]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderKuttabul();
  });
});

$('refreshKuttabul').addEventListener('click', async () => {
  const button = $('refreshKuttabul');
  button.disabled = true;
  try { await loadFuel(); } finally { button.disabled = false; }
});

/* --------------------
   PUBLIC INTERFACE
-------------------- */

FT.loadFuel =
  loadFuel;

FT.drawFuel =
  drawFuel;

FT.bindFuelRefresh =
  bindFuelRefresh;

FT.getFuelRows =
  () => fuelRows.slice();

})();
