import os
import requests
from datetime import datetime, timezone
import csv

SITE_ID = 61451636
API_URL = "https://fppdirectapi-prod.fuelpricesqld.com.au"

TOKEN = os.environ["FUEL_API_TOKEN"]

headers = {
    "Authorization": f"FPDAPI SubscriberToken={TOKEN}"
}

# Fuel IDs:
# 2 = U91
# 3 = Diesel
FUELS = {
    2: "U91",
    3: "Diesel"
}

response = requests.get(
    f"{API_URL}/Price/GetSitesPrices?countryId=21&geoRegionLevel=2&geoRegionId=10",
    headers=headers,
    timeout=30
)

response.raise_for_status()
data = response.json()

matches = []

for item in data.get("SitePrices", data.get("sitePrices", [])):
    site_id = item.get("SiteId", item.get("siteId"))
    fuel_id = item.get("FuelId", item.get("fuelId"))

    if site_id == SITE_ID and fuel_id in FUELS:
        price_raw = item.get("Price", item.get("price"))
        api_time = item.get(
            "TransactionDateUtc",
            item.get("transactionDateUtc", "")
        )

        matches.append({
            "checked_utc": datetime.now(timezone.utc).isoformat(),
            "api_time_utc": api_time,
            "fuel": FUELS[fuel_id],
            "fuel_id": fuel_id,
            "price_cents": float(price_raw) / 10
        })

if not matches:
    raise RuntimeError("No Kuttabul fuel prices found.")

filename = "fuel_history.csv"
file_exists = os.path.exists(filename)

existing = set()

if file_exists:
    with open(filename, "r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            existing.add(
                (row["api_time_utc"], row["fuel"], row["price_cents"])
            )

new_rows = [
    row for row in matches
    if (
        row["api_time_utc"],
        row["fuel"],
        str(row["price_cents"])
    ) not in existing
]

if new_rows:
    with open(filename, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "checked_utc",
                "api_time_utc",
                "fuel",
                "fuel_id",
                "price_cents"
            ]
        )

        if not file_exists:
            writer.writeheader()

        writer.writerows(new_rows)

for row in matches:
    print(
        f'{row["fuel"]}: {row["price_cents"]:.1f} c/L '
        f'| API time: {row["api_time_utc"]}'
    )

print(f"Saved {len(new_rows)} new record(s).")
