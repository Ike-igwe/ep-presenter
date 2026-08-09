## v1.0.34 — Style presets and microphone selection

### Style presets

Save a frame style once and apply it to any element, on any slide, in any deck.

- **Ten built-ins**: Clean, Soft Card, Floating, Neon Glow, Brand Gradient,
  Animated Ring, Tilted, Film Frame, Inset Dark, None
- **Save your own** from any styled element
- The active preset is highlighted; click it again to clear it
- Presets set border, shadow and 3D only — they never change the picture.
  Image effects stay in the Effects tab.

### Microphone selection

Recording previously always used the Windows default input, with no way to
choose. A picker is now available from the slide panel or by right-clicking
the mic button in the toolbar.

- Lists every input device with a live level meter to test before recording
- The selected device is shown in the panel and persists between sessions
- Falls back to the default if a saved device is unplugged
- Fixed exclusive-mode devices (such as NVIDIA Broadcast) recording silence:
  the picker's level meter was holding the device open

### Universal element styling

Text, lists, charts and sticky notes gained drop shadow and 3D lift, which
previously only images, shapes and media elements had. All element types now
share the same styling fields, which is what lets presets apply across types.
