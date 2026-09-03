import os
import requests
from datetime import datetime, timezone
import csv
import json

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

checked_utc = datetime.now(timezone.utc).isoformat()

matches = []
status = {
    "checked_utc": checked_utc,
    "fuels": {
        "U91": {
            "available": False,
            "price_cents": None,
            "api_time_utc": None
        },
        "Diesel": {
            "available": False,
            "price_cents": None,
            "api_time_utc": None
        }
    }
}

for item in data.get("SitePrices", data.get("sitePrices", [])):
    site_id = item.get("SiteId", item.get("siteId"))
    fuel_id = item.get("FuelId", item.get("fuelId"))

    if site_id != SITE_ID or fuel_id not in FUELS:
        continue

    fuel_name = FUELS[fuel_id]

    price_raw = item.get("Price", item.get("price"))
    api_time = item.get(
        "TransactionDateUtc",
        item.get("transactionDateUtc", "")
    )

    try:
        price_raw_number = float(price_raw)
        price_cents = price_raw_number / 10
    except (TypeError, ValueError):
        price_cents = None

    # Queensland feed is currently returning 9999 / 999.9 c/L
    # when a fuel is unavailable.
    unavailable = (
        price_cents is None
        or price_cents >= 900
    )

    status["fuels"][fuel_name] = {
        "available": not unavailable,
        "price_cents": None if unavailable else price_cents,
        "api_time_utc": api_time
    }

    if unavailable:
        print(
            f"{fuel_name}: unavailable "
            f"| API time: {api_time}"
        )
        continue

    matches.append({
        "checked_utc": checked_utc,
        "api_time_utc": api_time,
        "fuel": fuel_name,
        "fuel_id": fuel_id,
        "price_cents": price_cents
    })


# Save current fuel availability/status for the web app
with open("fuel_status.json", "w", encoding="utf-8") as f:
    json.dump(status, f, indent=2)


# Save genuine price history only
filename = "fuel_history.csv"
file_exists = os.path.exists(filename)

existing = set()

if file_exists:
    with open(filename, "r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            existing.add(
                (
                    row["api_time_utc"],
                    row["fuel"],
                    row["price_cents"]
                )
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

print(f"Saved {len(new_rows)} new historical price record(s).")
print("Updated fuel_status.json")
