# Insole Studio

A browser-based parametric insole editor built with React, Vite and Three.js. Define the outline, arrange supports, assign local infill, and download models for 3D printing.

## Features

- Foot and shoe dimensions, EU/Birkenstock and US size starting points, and editable outline landmarks.
- Mirrored or independent left/right insoles, undo/redo, autosave and editable JSON projects.
- Arch and heel controls plus any number of movable, rotated metatarsal pads with editable slope profiles.
- Base infill, support-linked overrides and custom density regions, with full-thickness, base-only or support-only scopes.
- Interactive 3D, wireframe, height and requested-infill views, plus a top-down editor.
- Downloads for PrusaSlicer 3MF with infill modifiers, STL, modifier ZIP, full-size SVG outline and editable project JSON.

All modeling and exports run in the browser. GitHub Pages serves the static application; no application server or account is required. Infill colors show requested settings rather than predicted compression. See the [density and PrusaSlicer guide](docs/insole-density.md) for modifier priority, filament foaming and slicer shell considerations.

The print tab and Prusa guide offer separate Siraya Flex TPU Air 85A and 95A calibration downloads for MK4 Input Shaper / MK4S 0.4 mm configurations. The material choice saves with the editable project and accompanies 3MF/ZIP exports as a reminder. Select the matching calibrated filament preset in PrusaSlicer; these design exports carry geometry and local infill overrides, without replacing machine settings. The Air presets are for active foaming material, not ordinary TPU of the same hardness.

## Run locally

Use Node.js 24 and pnpm 10.23.0.

```sh
npm install --global pnpm@10.23.0
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite, including `/insole-studio/`.

```sh
pnpm test
pnpm build
pnpm preview
```

`pnpm build` checks TypeScript and creates the static site in `dist/`. `pnpm preview` serves that production build locally.

## GitHub Pages

The Vite base path is `/insole-studio/`, matching a repository named `insole-studio`. Change `base` in `vite.config.ts` if hosting under a different path or at a domain root.

In the repository's **Settings → Pages**, select **GitHub Actions** as the publishing source. The [deployment workflow](.github/workflows/deploy.yml) runs tests and a production build on pushes to `main`, then publishes only `dist/`. It also supports manual runs. Actions are pinned to commit SHAs, and Pages write permissions are limited to the deployment job.

Exports use browser downloads on GitHub Pages just as they do locally. When exporting both feet, allow multiple downloads if the browser requests permission. A modern browser with WebGL is needed for the 3D preview.

## Privacy and projects

The repository starts with generic sample dimensions and fresh source-only history. It contains no saved personal designs, scans, credentials or development artifacts. The application has no analytics, tracking scripts or API that uploads your designs. Fonts are bundled with the site. GitHub handles ordinary requests for the hosted website under its own privacy policy.

Projects autosave in your browser's local storage. A small preference cookie remembers editor selections; it does not contain the design. JSON imports are read locally, and every exported file is generated locally. Use **Save project** for a portable backup: clearing browser storage removes local autosaves.

To move an existing design from a localhost workspace, choose **Save project** there, then **Open** the downloaded `.insole.json` file in this app. Browser storage is not transferred automatically between origins.

Keep personal measurements and exports outside the source repository. The `.gitignore` excludes common design/export formats, but review files before committing them, especially screenshots or renamed project files.
