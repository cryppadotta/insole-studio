# Insole Studio

A browser-based parametric insole editor built with React, Vite and Three.js. Define the outline, arrange supports, assign local infill, and download models for 3D printing.

## Features

- Foot and shoe dimensions, EU/Birkenstock and US size starting points, and editable outline landmarks.
- Mirrored or independent left/right insoles, undo/redo, autosave and editable JSON projects.
- Arch and heel controls plus any number of movable, rotated metatarsal pads with editable slope profiles.
- Negative pads carve smooth recesses into the finished surface. Adjust X/Y position, Depth (Z), width, length, rotation and slope; blue minus-marked footprints identify cuts. Overlapping cuts use the deeper cut and leave at least 0.8 mm above the flat underside. Recesses are baked into STL and 3MF geometry and inherit the surrounding infill settings.
- Arch and pads share a height reference above the base. The higher support surface wins at an overlap, so intersecting or duplicated pads do not add height. The base, heel cup and heel/toe lifts retain their thickness contributions. Crossing support slopes can still form a join.
- Base infill, support-linked overrides and custom density regions, with full-thickness, base-only or support-only scopes.
- Interactive 3D, wireframe, height and requested-infill views, plus a top-down editor.
- Downloads for PrusaSlicer 3MF with infill modifiers, STL, modifier ZIP, full-size SVG outline and editable project JSON.

All modeling and exports run in the browser. GitHub Pages serves the static application; no application server or account is required. Infill colors show requested settings rather than predicted compression. See the [density and PrusaSlicer guide](docs/insole-density.md) for modifier priority, filament foaming and slicer shell considerations.

The default **Complete MK4S project** 3MF includes an **MK4S standard 0.4 mm nozzle** printer profile, a 250 × 210 mm bed, 0.20 mm print settings, 2 perimeters, 0.6 mm top/bottom shells and the selected Siraya Flex TPU Air **85A or 95A** 250°C foam starting filament preset. Open it with **File → Open Project** in PrusaSlicer and load the project settings. Calibrate temperature and flow before a full insole. **Design only · use my presets** carries shape and local infill overrides without machine/filament profiles; the material remains a note, as it does in Modifier ZIP exports. The material choice saves with the editable project. Separate calibration preset downloads for MK4 Input Shaper / MK4S 0.4 mm configurations are available in the print tab and Prusa guide. These Air presets are for active foaming material, not ordinary TPU of the same hardness.

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

New editable projects use format version 4 so older editors cannot mistake a negative pad for a raised support. This editor also opens existing version 1–3 projects.

To move an existing design from a localhost workspace, choose **Save project** there, then **Open** the downloaded `.insole.json` file in this app. Browser storage is not transferred automatically between origins.

Keep personal measurements and exports outside the source repository. The `.gitignore` excludes common design/export formats, but review files before committing them, especially screenshots or renamed project files.
