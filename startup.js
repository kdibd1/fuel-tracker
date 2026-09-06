(() => {
'use strict';

/*
 * Fuel Tracker — startup
 *
 * Runs only after:
 * - config.js
 * - app.js
 * - charts.js
 * - fuel-prices.js
 *
 * have loaded.
 */

const FT =
  window.FuelTracker;

if (!FT) {
  console.error(
    'Fuel Tracker core failed to load.'
  );

  return;
}


/* --------------------
   INITIAL VALUES
-------------------- */

FT.$('date').value =
  FT.today();

FT.$('serviceDate').value =
  FT.today();


/* --------------------
   BUTTON EVENTS
-------------------- */

FT.bindFuelRefresh();


/* --------------------
   WINDOW EVENTS
-------------------- */

window.addEventListener(
  'online',
  () => {
    FT.sync();
  }
);

window.addEventListener(
  'resize',
  () => {
    if (
      FT.isDashboardOpen()
    ) {
      FT.render();
    }

    FT.drawFuel();
  }
);


/* --------------------
   START APPLICATION
-------------------- */

FT.picker();

FT.loadFuel();

FT.sync();

})();
