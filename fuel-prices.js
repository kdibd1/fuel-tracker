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


/* --------------------
   LOAD FUEL DATA
-------------------- */

async function loadFuel() {
  $('fuelUpdated').textContent =
    'Loading prices…';

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
