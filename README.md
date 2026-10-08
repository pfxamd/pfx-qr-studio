# PFx QR Studio

A responsive, local-first QR design workspace, powered by the independent [PFx QR Core](https://github.com/pfxamd/pfx-qr-core).

## Development

```bash
git clone https://github.com/pfxamd/pfx-qr-core.git core
npm install
npm run dev
npm run build
```

The `core/` checkout is excluded from this repository and is resolved by Vite at build time. GitHub Actions checks out both repositories to build and publish the website. The app supports URL, text, email, phone, SMS, and Wi-Fi payloads with SVG, PNG, and WebP export. Designs are generated in your browser.

Early alpha: QR Studio UI is under active development.
