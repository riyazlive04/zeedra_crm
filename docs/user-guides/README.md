# User guides

Plain-English guides to using Zeedra Solar CRM, one per role, with real screenshots from the app. Each guide only covers what that role can actually see and do.

| Role | Read online | Download PDF |
|---|---|---|
| Owner | [owner.md](owner.md) | [owner.pdf](pdf/owner.pdf) |
| Admin | [admin.md](admin.md) | [admin.pdf](pdf/admin.pdf) |
| Sales Manager | [sales-manager.md](sales-manager.md) | [sales-manager.pdf](pdf/sales-manager.pdf) |
| Tele-caller | [telecaller.md](telecaller.md) | [telecaller.pdf](pdf/telecaller.pdf) |
| Field Sales | [field-sales.md](field-sales.md) | [field-sales.pdf](pdf/field-sales.pdf) |
| Installer | [installer.md](installer.md) | [installer.pdf](pdf/installer.pdf) |

The app also has a built-in version of this guide. Any signed-in user can open **Help & guide** from the left sidebar (or from the person icon in the top right) to see the same content for their own role, without leaving the app.

## About the screenshots

Screenshots live in [`screenshots/`](screenshots), one folder per role, and were captured with Playwright against the demo data from `npm run db:reset`. To recapture them after a UI change:

```bash
npm run dev                                        # in one terminal, on port 3100
BASE_URL=http://localhost:3100 npm run guide:screenshots
```

The script signs in as each demo user (`owner@zeedra.demo`, `manager@zeedra.demo`, `telecaller@zeedra.demo`, `field@zeedra.demo`, `installer@zeedra.demo`, all using the password `Demo@12345`) and walks through the pages that role can see. It also expects an `admin@zeedra.demo` demo user for the one Admin-specific screenshot; create one directly in the database if it does not already exist, since the Owner's "add user" API is blocked once a plan's seat limit is reached.

## About the PDFs

PDFs live in [`pdf/`](pdf), one per role, and are generated from the Markdown guides above (same text, same screenshots, laid out for printing with a cover block, a contents page, and page numbers). To rebuild them after editing a guide or recapturing screenshots:

```bash
npm run guide:pdf
```

This renders each guide to HTML with [`marked`](https://www.npmjs.com/package/marked) and prints it to PDF with Playwright, so no extra tools (pandoc, wkhtmltopdf) are needed.
