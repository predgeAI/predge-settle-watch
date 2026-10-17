# Why Phantom says "This app's identity could not be verified"

Found 12 Oct 2026 by reading Phantom's own code (decompiled strings and bytecode of app.phantom, class `ai.g`, the Solana `digitalassetlinks` verifier).

How it verifies (Mobile Wallet Adapter, identity uri `https://predge.io`):
1. It reads the caller package's signing certificate from PackageManager and takes its SHA-256.
2. It fetches `https://predge.io/.well-known/assetlinks.json` with `HttpURLConnection`, redirects OFF, 200 required.
3. It requires the response `Content-Type` to be EXACTLY the string `application/json`. It compares with `String.equals`, so `application/json; charset=utf-8` fails with "Asset Links document type incorrect".
4. It requires a statement with relation `delegate_permission/common.handle_all_urls`, target `android_app`, our package name and a `sha256_cert_fingerprints` entry equal to the cert (colon separated hex).
5. Document size is capped.

Our file already satisfies 1, 2, 4 and 5 (the release key fingerprint is listed, 200 on the apex host, 341 bytes). The only failing check is 3: predge.io serves `content-type: application/json; charset=utf-8`.

## Fix (server side, no app change needed)
Serve `/.well-known/assetlinks.json` with exactly `Content-Type: application/json`. On Vercel add to `vercel.json`:

    { "headers": [ { "source": "/.well-known/assetlinks.json", "headers": [ { "key": "Content-Type", "value": "application/json" } ] } ] }

If the site is Next.js and the file comes from `public/.well-known/`, a `headers()` entry in `next.config.js` does the same. Check with:

    curl -sI https://predge.io/.well-known/assetlinks.json | grep -i content-type    # must print: content-type: application/json

Then force-stop Phantom, open Connect in Settle Watch: the red warning should be gone. Android App Link verification (`autoVerify`) is not used by Phantom's check and is not needed (an experiment with it changed nothing: `pm get-app-links` showed `predge.io: verified` and the warning stayed).
