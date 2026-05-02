# EP Presenter v4 — Release Notes

A major stability and polish release covering sticky notes, lasso, drawing, recording, webcam, and stickers. Many long-standing flicker and rendering bugs have been resolved, and the sticky note system has been substantially improved.

---

## Sticky Notes

**Rich text formatting per character.** Bold, italic, underline, font, font size, and color can now be applied to selections — not just the whole note. Use Ctrl+B / Ctrl+I / Ctrl+U or the toolbar buttons to format selected text.

**Recordings preserve formatting.** Sticky notes in exported videos now show all formatting (bold spans, multiple colors, mixed sizes) — previously they exported as plain text.

**Newlines render correctly in recordings.** A bug where multi-line notes appeared on a single line in exported videos has been fixed.

**Two visual styles.** Notes can now be Flat (2D) or Lifted (3D with shadow and slight rotation).

**Custom font dropdown** replaces the system dropdown for a consistent dark-theme look.

**Better editing experience.**
- Double-click to enter edit mode (single-click selects)
- Tool hotkeys (T, S, R, K, P) no longer fire while typing in a note
- Phantom scrollbar issue resolved
- Long text scrolls cleanly within the note

---

## Lasso Tool

**Group + reveal-step bug fixed.** Selecting elements with lasso, grouping them, and setting a reveal step now works reliably. Previously caused selection issues.

**Lasso properties panel no longer flickers.** Clicking buttons in the lasso sub-toolbar (Group, Delete, Clear, reveal step controls) is now smooth.

---

## Drawing & Annotation

**Recording flicker fixed.** A flash that appeared at the location of every pen/highlighter stroke in exported videos has been eliminated.

**Pen popover dismisses properly in presentation mode.** Picking a color in the ink popover now closes it automatically — no longer have to click outside first.

---

## Webcam

### Slide-element webcam (Insert → Webcam)

**Properties panel no longer flickers.** Changing shape, border color, mirror, badge, etc. is now smooth — the video stays playing while properties update.

**Live video in recordings.** Slide-element webcams now record as live video. Previously they could appear frozen on a single frame.

**Gradient and animated borders render in recordings.** Border styles other than solid now appear correctly in exported videos. Animated borders sweep colors around the webcam over time.

### Floating camera (W key)

**Full styling support.** A new gear (⚙) button on the floating camera opens a settings popover with:
- Shape: Circle, Rounded, or Sharp (rectangular)
- Border style: Solid, Gradient, or Animated
- Border colors (1 and 2)
- Border width

**No flicker during use.** The floating camera no longer flickers when drawing on slides or interacting with sub-toolbars.

**Free-drag positioning.** Drag the camera anywhere on screen during presentation. Position is preserved across window resizes via percentage-based storage.

**Tooltip clarification.** Tooltip now reads "Floating Camera (W) — separate from slide-element webcams" so it's clear this is a different feature from Insert → Webcam.

---

## Stickers (Animated Emojis)

**Click registration fixed.** Animated stickers in the picker now respond to the first click instead of requiring multiple attempts.

**Stickers animate in recordings.** Animated stickers are no longer frozen on a single frame in exported videos.

---

## Recording & Export

**WebM is now the recommended export format.** Instant save, no transcoding, no quality loss. MP4 is still available for cases that specifically need it (After Effects, Camtasia, YouTube uploads).

**Recording cache improvements.** Various rendering issues during recording have been resolved through smarter cache invalidation.

---

## Internal Architecture (for context)

Several rendering subsystems were refactored to eliminate flicker:
- The floating webcam overlay now lives outside the main render tree
- Slide-element webcam videos use a position-synced pool — never destroyed/recreated by renders
- Recording bitmap cache no longer nulls between frames

These changes resolved the "video blinks every time I touch anything" class of bugs.

---

## Known limitations / deliberately deferred

- **Properties-panel B/I/U buttons don't reflect selection state.** When you select bold text inside a note, the B button doesn't light up green to indicate it. Functionality works correctly; only visual state is missing. Will be addressed in a future release.
- **MP4 export is slower than WebM.** This is inherent — MP4 requires transcoding while WebM is the native recording format. Use WebM for fastest exports.
