## v1.0.25 — Screen share crop, presentation styling, recording fixes

### New: crop / region selection for screen share

Pick exactly which part of a shared screen appears on the slide, instead of
squeezing a whole 2561-wide desktop into a small element.

- Enter crop mode via the **Crop** button on the share, or by double-clicking it
- Drag inside the box to move, handles to resize, or drag on the dimmed area to
  draw a fresh region
- **Free** or **16:9** aspect lock; **Reset** restores the full frame
- Live source-pixel readout so you can tell when you're sampling at 1:1 or better
- Works in the editor and while presenting, including mid-recording — the
  audience sees the region update live while you keep the full screen in view
- Crop is stored per element, normalised, and survives save/reload

Cropping also **improves sharpness**: the selected region fills the slide closer
to 1:1 rather than being downscaled from the whole desktop.

### New: presentation-mode controls

Shares are no longer inert while presenting.

- Hover a share for a control chip: **Crop**, **Style**, **Full**
- **Alt+drag** to move, **Alt+Shift+drag** to resize (**Ctrl** keeps aspect)
- Draggable style panel with three tabs:
  - **Border** — none / solid / gradient / animated, full palette plus custom
    colour, continuous width and radius
  - **Shadow** — on/off, Soft / Deep / Glow presets, offset X and Y, blur,
    opacity, colour
  - **3D** — Lift with depth, plus new **Tilt X / Tilt Y / Perspective**

3D tilt now renders in exported MP4, not just on screen.

### Recording performance

Annotating while recording on a screen-share slide no longer lags.

- Shares with a shadow or 3D lift no longer fall off the layered compositor
- Shadows are rendered once into a cached sprite instead of running a
  `ctx.filter` drop-shadow over a full-size buffer every frame
- Animated borders on shares no longer force the slow full-slide re-render path

### Fixes

- Screen share showed a black box on the main canvas while the slide thumbnail
  held the stream — the stream now attaches to every matching video element
- Hairline dark arcs on the rounded corners of bordered shares
- Dark rim around shares with a drop shadow
- Shadow on a tilted share now follows its rounded corners
- Floating webcam appeared in a different position when recorded than on
  screen — position, size, border width and radius now map through the stage
  rectangle instead of window fractions
- Floating webcam was stretched to a square in every export; it now cover-fits
  to match the on-screen overlay
- Floating webcam border was clipped flat at the edges of its buffer

### Console helpers

`epShareIds()`, `epSetCrop(id, x, y, w, h)`, `epGetCrop(id)`, `epClearCrop(id)`,
`epRecDiag()`, `epTiltMesh(n)`
