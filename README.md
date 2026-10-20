# PFx QR Studio

A responsive, privacy-first workspace for creating, designing, exporting, scanning, and validating QR codes directly in your browser.

Live application: https://pfxamd.github.io/pfx-qr-studio/

## Features

- Generate QR content for websites (including YouTube), text, email (subject and body), phone, SMS (message), and Wi-Fi (password-protected/open and hidden networks).
- Choose six module styles, foreground/background colors, quick palettes, and error correction.
- Adjust quiet zone (0–128 px) and output resolution (128–4096 px).
- Add a logo, export PNG/SVG/WebP, copy PNG, or copy encoded content.
- Test generated QR images against their original content with the scanning engine.
- Scan PNG/JPEG/WebP QR images locally and copy decoded results.
- Responsive light/dark interface, with local preference storage. Images are processed in your browser, not uploaded.

## Workspace design

The Studio uses a fixed-height, no-page-scroll application layout inspired by the PFxAMD visual identity. A compact tool rail switches between Content, Design, Output, and Scanner; the preview and download tools remain in view. On small screens, settings open in an overlay above the QR canvas. The interface includes the PFxAMD signature in its footer.

## Architecture

The generation and scanning engine is maintained separately in [PFx QR Core](https://github.com/pfxamd/pfx-qr-core). Studio imports its public API; its build pins a specific QR Core commit for reproducible deployments.

## Development

```bash
git clone https://github.com/pfxamd/pfx-qr-studio.git
cd pfx-qr-studio
git clone https://github.com/pfxamd/pfx-qr-core.git core
npm install
npm run dev
npm run build
```

GitHub Pages publishes automatically from `main`. The deployment workflow checks out both repositories and builds the static website.

**Status:** Alpha 0.1. Test code readability, especially with custom styles, inverted colors, or logos, before printing or distributing it.
