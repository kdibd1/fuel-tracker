# Fuel Tracker

A mobile-friendly, multi-vehicle fuel tracker with shared Supabase storage and hourly Kuttabul Road House Diesel/U91 price tracking.

## One-time setup

1. In the Supabase SQL editor, run `supabase-schema.sql` once.
2. In GitHub repository settings, add an Actions secret named `FUEL_API_TOKEN` containing the Queensland Fuel Price Reporting API subscriber token.
3. Upload all files to the repository and enable GitHub Pages (deploy from the default branch/root).
4. Run the **Kuttabul Fuel Tracker** workflow manually once. It then runs hourly and updates `fuel_history.csv` and `fuel_prices.png`.

`config.js` contains only the Supabase project URL and browser-safe publishable key. Never put the private fuel API token in that file.

## Data behaviour

- Vehicles and fill-ups are stored in Supabase and shared across browsers using the configured workspace.
- A local cache keeps the app usable if Supabase is temporarily unavailable.
- Existing `fuelTracker.data.v2` data is uploaded on the first successful connection when the cloud tables are empty.
- Older `fuelTracker.entries.v1` fill-ups are moved into the first vehicle created, preserving the original migration behaviour.

## Files

- `index.html`, `styles.css`, `app.js`, `config.js`: GitHub Pages app
- `supabase-schema.sql`: database tables, indexes, permissions and row-level security policies
- `fuel_tracker.py`: fetches Kuttabul prices using the private Actions secret
- `make_graph.py`: generates the downloadable PNG graph
- `fuel_history.csv`: history used by the in-app graph
- `.github/workflows/fuel_tracker.yml`: hourly collection automation
