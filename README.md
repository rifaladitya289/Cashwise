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

An Android WebView wrapper and automated debug-APK workflow are included under `android/` and `.github/workflows/android.yml`. The workflow builds a debug APK and uploads it as the `cashwise-debug-apk` artifact. The first successful CI build and real-device checks are still required before treating the APK as verified.

Open the repository's **Actions** tab, select **Build Cashwise Android APK**, and use **Run workflow** on the `development` branch to request a build. Download the APK from the completed run's Artifacts section.

## Data model

- `transactions`: income, expense, allocation, withdrawal
- `goals`: savings and purchase goals
- `settings`: profile and UI preferences

Internal allocation is not income. It moves funds from available balance into a goal without changing total balance.

## License

No license has been assigned yet.