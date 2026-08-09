## v1.0.33 — Element layering, drag and drop, PPTX notes

### Element layering fixed

Elements added after a webcam no longer disappear behind it. The slide's
element layer carries a CSS transform for zoom, which creates a stacking
context — so per-element z-index only ordered elements against each other,
never against the camera video. The layer now has its own stacking level.

- **Front / Back / Forward / Backward** controls in the properties panel
- New elements spawn in free space instead of landing on existing ones

### Drag and drop

Drop files anywhere on the window: **.pptx** imports, **.json** opens a saved
deck, **video** and **image** files insert onto the current slide.

### PowerPoint speaker notes

Notes now survive import and export. They live in a separate part of the PPTX
package that the importer never read, and the exporter never wrote — so notes
were dropped in both directions.

### Webcam styling

Rebuilt to work with the new layering, where the camera video sits beneath the
element layer.

- Border radius, solid and gradient borders, and drop shadow restored
- Animated borders animate on screen again
- Shadows fall outside the frame instead of bleeding across the border
- Fixed webcam elements rendering stretched in exported video
- Added a camera zoom control (1×–3×)

### Also

- Configurable presenter view: four layouts, adjustable notes text and panel
  height, persistent settings
- Slide reordering by drag, buttons, or Ctrl+Shift+Up/Down
- Wider snapping thresholds with a larger catch on stage centre
