# Setting up: Photo & Video Metadata Remover

Added to Quick Tools (tools.html) and listed on the Features page. Removes
hidden metadata from photos and videos before you share them - camera
info, GPS location, and increasingly, tags that name exactly which AI
tool generated the file (things like C2PA content credentials, a
Stable Diffusion "parameters" field, or a Midjourney/DALL-E software
tag).

## Step 1: nothing to run

No schema change, no Edge Function, no new Supabase table. Both tools
run completely inside the visitor's own browser - nothing is ever
uploaded, not even to Boardly's own servers. This matches the existing
"Everything on this page stays on this device" promise already made at
the top of the Quick Tools page.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Photo & Video Metadata Remover"
git push
```

## Step 3: test it

Go to **Tools**, scroll to the new "Strip AI & EXIF metadata" section.

**Photos:** pick a JPG, PNG, or WebP, then click **Remove metadata &
download**. A cleaned copy downloads immediately, named like
`photo-cleaned.jpg`.

**Videos:** pick an MP4, MOV, or WebM, then click the same button.
The FIRST time this runs on any given visit, it'll say "Loading the
video engine" for a few seconds - that's a real, small build of FFmpeg
being downloaded into the browser (about 30MB, one time per visit,
cached by the browser normally after that). After that, a progress bar
shows the actual cleaning, which is usually fast since it doesn't
re-encode the video.

## How each one actually works, and why they work differently

**Photos** use a trick that needs no library at all: the browser draws
the picture onto a blank canvas, then saves THAT canvas as a brand new
file. A canvas only ever holds raw pixels - it has no concept of EXIF,
GPS, or any other hidden field - so none of the original file's hidden
data has any way to survive the redraw. This is also why it's so
reliable: there's no specific list of "known AI metadata tags" to keep
updated as new AI tools invent new ones, because the method doesn't
care what the hidden data even was.

One real tradeoff worth knowing: this only ever keeps a single still
frame, so an animated GIF put through it would come back flattened.
The tool's own description says so - if that ever needs proper
animated-GIF support, that's a different, harder problem for another
day.

**Videos** can't use that same trick (a canvas can't hold a moving
picture and an audio track together), so this loads a real WebAssembly
build of FFmpeg - [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)
- the first time someone uses it, and runs it with two flags:
`-map_metadata -1` (strip every metadata field) and `-c copy` (copy the
actual video and audio data byte-for-byte instead of re-encoding it).
That second flag is what keeps this fast and lossless - re-encoding a
whole video would be both much slower and would genuinely reduce
quality, for no benefit here since the goal is only to remove
metadata, not touch the picture itself.

This deliberately uses the single-threaded build of ffmpeg.wasm
(`@ffmpeg/core`, not `@ffmpeg/core-mt`). The faster multi-threaded
build needs special `Cross-Origin-Embedder-Policy` /
`Cross-Origin-Opener-Policy` HTTP headers that GitHub Pages has no way
to set - using it anyway would mean shipping something that quietly
never works once it's actually live. Single-threaded is a little
slower, but it's the version that will actually run for anyone who
opens the page.

## If a video file doesn't work

`-c copy` occasionally fails on video files with an unusual or
partially corrupted container - if that happens, the tool will show a
plain error message rather than a silent failure. There's no
transcoding fallback built in yet (that would mean re-encoding, giving
up the "lossless and fast" benefit above) - if this turns out to
matter in practice, a "try again with re-encoding" fallback option
would be a reasonable small addition later.
