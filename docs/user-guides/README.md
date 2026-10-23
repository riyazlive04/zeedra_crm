# User guides

Plain-English guides to using Zeedra Solar CRM, one per role, with real screenshots from the app. Each guide only covers what that role can actually see and do.

- [Owner](owner.md)
- [Admin](admin.md)
- [Sales Manager](sales-manager.md)
- [Tele-caller](telecaller.md)
- [Field Sales](field-sales.md)
- [Installer](installer.md)

The app also has a built-in version of this guide. Any signed-in user can open **Help & guide** from the left sidebar (or from the person icon in the top right) to see the same content for their own role, without leaving the app.

## About the screenshots

Screenshots live in [`screenshots/`](screenshots), one folder per role, and were captured with Playwright against the demo data from `npm run db:reset`. To recapture them after a UI change:

```bash
npm run dev                                        # in one terminal, on port 3100
BASE_URL=http://localhost:3100 node scripts/guide-screenshots.mjs   # in another
```

The script signs in as each demo user (`owner@zeedra.demo`, `manager@zeedra.demo`, `telecaller@zeedra.demo`, `field@zeedra.demo`, `installer@zeedra.demo`, all using the password `Demo@12345`) and walks through the pages that role can see. It also expects an `admin@zeedra.demo` demo user for the one Admin-specific screenshot; create one directly in the database if it does not already exist, since the Owner's "add user" API is blocked once a plan's seat limit is reached.
