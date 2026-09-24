# PriceCrawler

Cloudflare Worker + D1 prototype for an automatically refreshed deal and pricing-anomaly dashboard.

## Current prototype
- Cloudflare Cron every 3 minutes
- D1 price history and saved-deal storage
- Mobile-first Live Deals / Saved UI
- Manual scan endpoint: POST /api/scan
- Browser refresh every 3 minutes
- Demo deals included for testing before a permitted commerce data source is connected

## Deploy

1. Create a Cloudflare D1 database named `pricecrawler-db`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml` with the database ID.
3. Run `schema.sql` against the D1 database.
4. Deploy with Wrangler.

For real Amazon/Flipkart data, connect a permitted commerce/price-data API or feed and set `DEALS_SOURCE_URL` as a Worker variable/secret. The feed can return an array of deal objects or `{"deals":[...]}`.

Required fields:
- `id`
- `title`
- `store`
- `price`
- `url`

Optional:
- `previous_price`
- `typical_price`
- `currency`
- `image_url`

The prototype does not bypass Amazon/Flipkart anti-bot protections. Use data sources you are permitted to access and follow the retailer/provider terms.
