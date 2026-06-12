# Reverse Bundle Pro — Operations Guide

## Admin console

| URL | Purpose |
|-----|---------|
| `https://reverse-bundling.me/admin` | Merchant dashboard, analytics, system health |
| `https://reverse-bundling.me/admin/merchants` | All shops — filter by onboarding stage |
| `https://reverse-bundling.me/admin/system` | Live DB + memory monitoring |
| `https://reverse-bundling.me/health` | Public health JSON (use with UptimeRobot) |

Set `ADMIN_PASSWORD` in production `.env` (never use the default).

## SSH access

```bash
ssh reverse-bundling
# Port 2222 — ISP blocks port 22
```

Server path: `/home/deploy/reverse-bundling`

```bash
systemctl status reverse-bundling
journalctl -u reverse-bundling -f
systemctl restart reverse-bundling
```

## Merchant pipeline

Track every shop through these stages:

1. **Installed** — OAuth complete, no settings yet → send setup email within 24h
2. **Onboarding** — settings saved, no active rules → book 30-min onboarding call
3. **Rules live** — active bundle rules, no conversions yet → watch first orders together
4. **Converting** — real order conversions → ask for App Store review
5. **At risk** — installed 7+ days, no active rules → personal outreach, offer done-for-you setup

Filter **At risk** in Admin → Merchants weekly.

## Weekly operator checklist

- [ ] Admin → Dashboard: conversion rate, new merchants
- [ ] Admin → Merchants → filter **At risk** and **Onboarding**
- [ ] Shopify Partners → App analytics: installs, trials, revenue
- [ ] Email every uninstall (Partners dashboard or manual follow-up)
- [ ] Check `https://reverse-bundling.me/health`
- [ ] `journalctl -u reverse-bundling --since "7 days ago" | grep -i error`

## Deploy updates

```bash
ssh reverse-bundling
su - deploy
cd ~/reverse-bundling
git pull origin main
npm ci
npm run build
exit
systemctl restart reverse-bundling
curl -s http://127.0.0.1:3000/health
```

## Uptime monitoring (free)

1. [UptimeRobot](https://uptimerobot.com) → HTTP(s) monitor
2. URL: `https://reverse-bundling.me/health`
3. Alert: email when status ≠ 200 or body missing `"healthy"`

## Getting paid merchants

Outbound beats App Store organic for this niche. Target stores with:

- 50–500 orders/day
- Repeat multi-SKU orders
- ShipStation or 3PL fulfillment

Offer **done-for-you setup** for the first 10 merchants. Charge after you show pick-time or fulfillment savings.

See `APP_STORE_LISTING_COPY.md` for listing text to paste in Shopify Partners.
