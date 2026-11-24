# Cashwise

**Simple. Elegant. Functional.**

Cashwise is an offline-first personal finance and savings tracker built with HTML, CSS, and vanilla JavaScript.

## Features

- Dashboard with total, available, and allocated balances
- Income and expense recording
- Savings and purchase goals
- Goal allocations, deposits, and withdrawals
- Transaction history with search and type filters
- Dark, light, and system themes
- Reduced-motion preference
- JSON export and validated import
- Local IndexedDB persistence
- PWA application-shell caching

## Run locally

Serve this folder over localhost (for example, with a local static server), then open the local URL. IndexedDB and service workers require a secure context such as localhost or HTTPS.

## GitHub Pages preview

In repository **Settings → Pages**, choose **Deploy from a branch**, select `development` and `/(root)`. Preview URL:

`https://rifaladitya289.github.io/Cashwise/`

## Offline behavior

The application shell is cached by the service worker after the first successful load. Finance records are stored in IndexedDB on the current browser/WebView profile. No account or remote API is required.

Browser storage can still be cleared by the operating system or browser. Export a JSON backup regularly. Uninstalling an Android app may remove local data.

## Android APK status

The current branch contains the working web application/PWA foundation. A completed Android APK still requires the native WebView wrapper, release signing, and device-level offline testing. Do not distribute an APK until those steps pass.

## Data model

- `transactions`: income, expense, allocation, withdrawal
- `goals`: savings and purchase goals
- `settings`: profile and UI preferences

Internal allocation is not income. It moves funds from available balance into a goal without changing total balance.

## License

No license has been assigned yet.