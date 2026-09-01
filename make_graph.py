import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from datetime import timedelta

CSV_FILE = Path("fuel_history.csv")
OUTPUT_FILE = Path("fuel_prices.png")

if not CSV_FILE.exists():
    raise FileNotFoundError("fuel_history.csv doesn't exist yet.")

df = pd.read_csv(CSV_FILE)

# Convert timestamps to Queensland time
df["time"] = pd.to_datetime(df["api_time_utc"], utc=True)
df["time"] = df["time"].dt.tz_convert("Australia/Brisbane")

# Make sure prices are numbers
df["price_cents"] = pd.to_numeric(df["price_cents"])

df = df.sort_values("time")

plt.figure(figsize=(12, 6))

for fuel in ["Diesel", "U91"]:
    fuel_data = df[df["fuel"] == fuel]

    if not fuel_data.empty:
        plt.step(
            fuel_data["time"],
            fuel_data["price_cents"],
            where="post",
            marker="o",
            label=fuel
        )

# Always show the most recent 30 days
latest_time = df["time"].max()
plt.xlim(
    latest_time - timedelta(days=30),
    latest_time + timedelta(hours=6)
)

plt.title("Kuttabul Road House Fuel Prices - Last 30 Days")
plt.xlabel("Date")
plt.ylabel("Price (c/L)")
plt.grid(True, alpha=0.3)
plt.legend()
plt.tight_layout()

plt.savefig(OUTPUT_FILE, dpi=150)
plt.close()

print(f"Graph created: {OUTPUT_FILE}")
