# Where in the World is Carmen Sandiego? in the browser

**Play it here: https://timbr.github.io/carmen/**

This is *Where in the World is Carmen Sandiego? Deluxe* (Brøderbund, 1996) running on
Windows 98 inside [v86](https://github.com/copy/v86), an x86 PC emulator written in
JavaScript and WebAssembly. It replaces a VirtualBox virtual machine that used to run the
game on Windows XP. Everything runs in the browser, with no plug-ins and no server code, so
the site can be hosted on any static web host. It was inspired by
[Encarta 95 Web](https://github.com/benwinding/encarta_95_web), which does the same for
Microsoft Encarta 95.

The page opens straight into the game from a saved snapshot. It has sound effects, speech
and music, a mouse pointer that simply follows yours, and controls for volume, screen size
and fullscreen. It also works on phones and tablets.

This repository holds the built site. The rest of this file explains how it was made.

## Contents

- [Using it](#using-it)
- [How it was built](#how-it-was-built)
  - [1. Starting point](#1-starting-point)
  - [2. Building a Windows 98 machine](#2-building-a-windows-98-machine)
  - [3. Running it in the browser with v86](#3-running-it-in-the-browser-with-v86)
  - [4. 256 colours](#4-256-colours)
  - [5. Sound](#5-sound)
  - [6. Music](#6-music)
  - [7. The mouse](#7-the-mouse)
  - [8. Fast start](#8-fast-start)
  - [9. Making it smaller](#9-making-it-smaller)
  - [10. The static site](#10-the-static-site)
  - [11. The viewer](#11-the-viewer)
  - [12. Phones and tablets](#12-phones-and-tablets)
  - [13. Publishing](#13-publishing)
  - [14. Smoother sound online](#14-smoother-sound-online)
- [Source project layout](#source-project-layout)
- [Working on it](#working-on-it)
- [Credits and licences](#credits-and-licences)

## Using it

1. Open the page and click **Start**. The game resumes from a snapshot within a second or two.
   The click is also what allows the browser to play sound.
2. Play with the mouse as normal. Windows' pointer follows yours; there's no need to click
   to capture it.
3. The bar under the game has:
   - **Mute** and **volume**, for everything: sound effects, speech and music.
   - **Size:** 1×, 1.5×, 2× or Fit. The game's resolution stays 640×480; this only scales it.
   - **Smooth:** softens the pixels when scaled.
   - **CRT:** adds scanlines like an old monitor.
   - **Fullscreen.**
4. On a phone or tablet there are also:
   - **Keyboard:** opens the on-screen keyboard, for typing your name into the game.
   - **Trackpad:** drag anywhere to move the pointer and tap to click, like a laptop touchpad.

   Turn the phone sideways for a bigger screen. On iPhone, **Share → Add to Home Screen**
   opens it full-screen from its own icon.

Your settings are remembered in your browser. Nothing you do in Windows is saved: reloading
the page puts the machine back to the snapshot.

After you press Start, the page downloads the game's data in the background (about 87 MB)
and keeps it on your device, so sounds and pictures play without waiting. **Details** shows
how far it has got. Later visits load from the device. The download is skipped if your
device has Data Saver turned on.

## How it was built

### 1. Starting point

The game had been running in a VirtualBox virtual machine: Windows XP SP3, 192 MB RAM and a
2 GB disk, with the game's CD image (`world_eu.iso`, 515 MB) in its CD drive.

The CD turned out to hold the European Deluxe edition: a 16-bit Windows 3.1/95 program
(Brøderbund's "Mohawk" engine) with its data in English, German and French versions. Since
it predates Windows XP, the plan was to use Windows 98 SE instead. v86 runs Windows 98 well
and XP poorly, and 98 is what the game was made for.

Other routes were checked first:

- **ScummVM**, which plays many old adventure games without an operating system. It
  recognises only later editions of this game (as `csworld`), and marks even those as
  unsupported.
- **The existing XP disk.** XP isn't on v86's list of working systems, would be slower and
  heavier, and was set up for VirtualBox's hardware.

### 2. Building a Windows 98 machine

Windows 98 Second Edition was installed in [QEMU](https://www.qemu.org/) onto a 1 GB raw disk
image, as v86's
[Windows 9x guide](https://github.com/copy/v86/blob/master/docs/windows-9x.md) recommends.
Installing directly in v86 has known problems. QEMU was configured to resemble v86's
hardware, so the finished disk would boot there unchanged:

- 128 MB RAM, ACPI off;
- the standard VGA card (Bochs VBE, PCI ID 1234:1111);
- no network card.

Drivers and fixes along the way:

- **Mouse:** VBADOS's VBMOUSE was installed for v86's VMware-style absolute mouse. Its
  Windows driver later turned out to crash Windows 98 in v86 (see [the mouse](#7-the-mouse)),
  so only its DOS part remains, loaded from `AUTOEXEC.BAT`.
- **Getting files in:** QEMU's floppy drives didn't work with Windows 98. Driver files were
  passed in through a host folder shown as a read-only hard disk instead, using QEMU's virtual
  FAT drive with a throwaway writable layer.
- **Sound:** QEMU's Sound Blaster 16 crashes Windows 98's driver (`VSB16`), so sound was left
  out of QEMU and set up in v86 later.
- **The game:** installed from the CD, with the CD as drive D:, the letter it also has in v86.

### 3. Running it in the browser with v86

The [v86 npm package](https://www.npmjs.com/package/v86) provides the emulator, and the BIOS
files come from the v86 repository. A small Node server (`scripts/serve.mjs`) serves the page
and answers HTTP range requests. That way, v86 only downloads the parts of the 1 GB disk and
the CD that Windows actually reads.

v86 keeps any disk writes in memory. So the local page has a **Save disk** button that sends
just the changed 256-byte blocks to the server, which writes them into the disk image. Making
changes inside v86 also allowed `?cd=win98`, which swaps the Windows 98 CD into the drive for
installing drivers.

### 4. 256 colours

Carmen refuses to start unless Windows runs in 256 colours, and Windows kept dropping back to
16-bit colour. Investigation showed:

- The VBE9x display driver couldn't set an 8-bit mode on this graphics card, whichever video
  BIOS was used. That included QEMU 11.1's SeaBIOS 1.17 video BIOS, which has the VBE "set
  palette" call that v86's older one lacks.
- **VMDisp9x**, a display driver that programs the Bochs graphics card directly instead of
  going through the BIOS, fixed it. It was installed in QEMU, and the setting carried over to
  v86 because both emulate the same card.

### 5. Sound

v86 emulates a Sound Blaster 16, at port 220, IRQ 5 and DMA 1/5. Adding the card through
Windows' **Add New Hardware** crashed during its hardware search. The cause was VMDisp9x, in
both QEMU and v86. The workaround:

1. In v86, switch the display to the standard VGA driver.
2. Add the Sound Blaster.
3. Switch back to VMDisp9x and 256 colours.
4. Save the disk.

Browsers only allow a page to play sound after the user interacts with it. So the page loads
the emulator paused behind a **Start** button, and that click unlocks the audio as it starts
the game.

### 6. Music

The game's music is MIDI. Windows sends it to the Sound Blaster's MIDI port (MPU-401,
port 330), but v86 discards those bytes and has no FM synthesiser either. The page
(`midi.js`) fills the gap:

- **Taking over the MIDI port** in v86. It answers the reset and UART-mode commands as a real
  MPU-401 does, and also catches MIDI sent through the Sound Blaster's own DSP commands.
- **Turning the byte stream into complete MIDI messages,** including running status and
  system-exclusive data.
- **Playing them on [SpessaSynth](https://github.com/spessasus/spessasynth_lib),** a General
  MIDI synthesiser that runs inside the page, using the
  [GeneralUser GS](https://www.schristiancollins.com/generaluser.php) sound bank.

The first attempt sent the music to Windows' built-in GS Wavetable synth through the
browser's Web MIDI support. That doesn't work, because Chrome and Firefox deliberately hide
that synth from web pages.

### 7. The mouse

v86 can provide a VMware-style absolute mouse, but Windows 98 never switches it on. VBMOUSE's
Windows driver, which should do that, crashed Windows 98 in v86 with a protection error.
Without it, the browser has to capture the mouse pointer, which is awkward.

Instead, the page steers Windows' ordinary PS/2 mouse itself (`pointer.js`):

- Whenever your pointer enters the game, it pins Windows' pointer to the top-left corner,
  then moves it exactly to where yours is, in screen pixels.
- Your own cursor is hidden over the game, so you only see Windows' pointer, sitting right
  where yours would be.
- Windows dropped movement packets that arrived in bursts, so they're queued and sent one at
  a time as Windows reads them. Clicks and the wheel share that queue, so a click can't
  overtake the move before it.
- Windows' pointer speed is set to its slowest, which turns off acceleration so that one unit
  of movement is one pixel.

### 8. Fast start

Booting Windows takes about a minute. Instead, the page restores a **snapshot**: a saved copy
of the whole running machine at Carmen's title screen, about 12 MB compressed with zstd.
Restoring takes about a second. On the local page:

- **Save snapshot** captures the running machine.
- Saving the disk retires the snapshot automatically, because a snapshot is only valid with
  the exact disk it was taken from.
- Adding `?boot` to the address forces a normal boot.

### 9. Making it smaller

- **The CD:** an English-only copy (`scripts/trim-cd.mjs`). It overwrites the German (`.DAD`)
  and French (`.DAF`) data, two demos for other titles and the German and French installers
  with zeros. Files keep their positions, so the snapshot stays valid, and the zeros compress
  to almost nothing. 318 MB down to 87 MB, compressed.
- **The Windows disk:** free space zeroed by reading the FAT32 allocation table
  (`scripts/zero-free-space.mjs`). This removes leftovers of deleted files, though only 4 MB
  of them.
- **The sound bank:** converted from SF2 to SF3, which compresses each sample with Ogg Vorbis
  (`scripts/compress-soundfont.mjs`). 31 MB down to 8 MB.

Altogether, the published size went from about 450 MB to about 195 MB. A first visit needs
about 23 MB (snapshot, sound bank and emulator) before the game starts; the rest arrives in
pieces as the game reads it, or in the background (see
[smoother sound online](#14-smoother-sound-online)).

### 10. The static site

`scripts/build-static.mjs` builds the site into `dist/`:

- It splits the disk and the CD into 256 KB pieces, each compressed with zstd. v86 fetches and
  decompresses these on demand, so the host needs no special server support.
- It copies the page, emulator, synthesiser, sound bank, snapshot, icons, licence files and
  this README.
- It writes a `config.json` that tells the page where everything is. The page reads this
  file in both the local and static versions, and the local one also enables the Save
  buttons. The static version also carries a build id and the list of CD pieces to preload.
- It keeps a `.git` folder inside `dist/`, so `dist/` can be published directly as a Git
  repository.

All paths are relative, so the site works at the root of a domain or in a subfolder, as on
GitHub Pages.

### 11. The viewer

- The page shows a title header, the game in a bezel, and a control bar.
- Technical readouts (screen mode, MIDI traffic) are in a collapsible **Details** panel.
- **Volume:** v86's sound output and the music synth both pass through one volume control.
- **Size:** the screen is scaled with a CSS transform. v86 normally resizes its canvas to
  cancel out Windows display scaling, so the page pins the canvas to its real resolution, and
  1× means exactly 640×480 on any display.
- **Keyboard focus:** clicking a control hands the keyboard straight back to the game, so
  pressing Space or Enter in Carmen doesn't press a button by accident.

### 12. Phones and tablets

The same page adapts to touch screens:

- **Portrait:** a compact layout, the game fitted to the width, and a hint to turn the phone
  sideways.
- **Landscape:** no header, and the controls in a two-column grid beside the game, so it can
  use the full height.
- **Keyboard button** (`keyboard.js`): opens the on-screen keyboard through a hidden text
  field and sends the typed text to Windows. Phone keyboards don't report real key codes for
  letters.
- **Trackpad mode:** dragging moves Windows' pointer at 1.5× finger speed, and a tap clicks.
- **Fullscreen** on Android, with the screen locked to landscape.
- **A web app manifest and icons,** so iPhones can add it to the home screen and open it
  full-screen.
- **iPhone silent switch:** Starting the game asks iPhones to play sound even with the switch
  on. Only newer iOS versions support this.

### 13. Publishing

The contents of `dist/` were pushed to this repository, and GitHub Pages serves them from the
`main` branch. GitHub Pages has to be switched on once, under the repository's
**Settings → Pages**.

### 14. Smoother sound online

On a phone, the published site had gaps between sound samples. The game plays speech and
sound effects straight from the CD, so the first time each sound played, Windows waited
while that 256 KB piece of the CD downloaded. That took about 125 ms on a fast home
connection, and usually longer on a phone. On the local server everything came from disk,
so this hadn't shown up. The emulator itself was fast enough.

Two additions fix it on the static site:

- **Background preload** (`preload.js`). Once the game starts, the page downloads the
  English CD data in the background: sound and speech (`AUDIO.DAE`) first, then the
  courtroom and ending scenes, then everything else.
  - That's 576 pieces, about 87 MB. Pictures and audio barely compress.
  - The build works out the list and its order, leaving out the blanked German and French
    data.
  - Two downloads run at a time, so the game's own requests aren't held up.
  - It's skipped when Data Saver is on.
- **Keeping files on the device** (`sw.js`). A service worker stores the disk and CD pieces,
  the snapshot, the sound bank and the emulator in the browser's cache, and answers requests
  from there.
  - With everything saved, a CD read takes about 2 ms instead of about 125 ms, and return
    visits load without the network.
  - Each build has its own id in `config.json` and its own cache, and a new build deletes
    the old one. So pieces of the disk and snapshot from different builds can never mix.
  - The page and `config.json` always come from the network, so updates are picked up.
  - It's only used on the static site, not the local server.

**Details** also shows the emulator's speed, in millions of instructions per second. Around
30 or more is comfortable for Windows 98.

## Source project layout

The source project that builds this site has more in it than this repository:

| Path | What it is |
|---|---|
| `web/` | The page (`index.html`, `midi.js`, `pointer.js`, `keyboard.js`, `preload.js`), the service worker (`sw.js`), local `config.json`, manifest, icons and BIOS files |
| `scripts/serve.mjs` | Local server: range requests, Save disk, Save snapshot, and `--static <folder>` to test a build |
| `scripts/build-static.mjs` | Builds the static site into `dist/` |
| `scripts/trim-cd.mjs` | Makes the English-only CD |
| `scripts/iso-files.mjs` | Lists the files on a CD image and where they are |
| `scripts/zero-free-space.mjs` | Zeroes free space on the Windows disk |
| `scripts/compress-soundfont.mjs` | Converts the sound bank to SF3 |
| `scripts/make-icons.mjs` | Draws the app icons |
| `scripts/run-qemu.ps1` | Starts the Windows 98 disk in QEMU, for changes that need it |
| `images/` | The Windows 98 disk, the English-only CD and the snapshot |
| `media/` | Windows 98 install CD, driver downloads and the sound bank |

## Working on it

To run it locally:

```bash
node scripts/serve.mjs
```

Then open http://localhost:8086/. The local page shows **Save disk** and **Save snapshot**
under **Details**.

To change something inside Windows:

1. Make the change, shut Windows down, and click **Save disk** when it says it's safe to turn
   off the computer.
2. Reload the page, get to the point you want it to open at, and click **Save snapshot**.

To publish an update, rebuild, then commit and push the contents of `dist/`:

```bash
node scripts/build-static.mjs
```

## Credits and licences

- [v86](https://github.com/copy/v86): x86 emulator (BSD 2-Clause)
- [SpessaSynth](https://github.com/spessasus/spessasynth_lib) and stb-vorbis: MIDI synthesiser
  and Vorbis decoder (Apache 2.0)
- [GeneralUser GS](https://www.schristiancollins.com/generaluser.php) by S. Christian Collins:
  General MIDI sound bank (GeneralUser GS License v2.0)
- [VMDisp9x](https://github.com/JHRobotics/vmdisp9x) and
  [VBADOS](https://git.javispedro.com/cgit/vbados.git/about/): Windows 98 display and mouse
  drivers, installed inside the disk image
- [SeaBIOS](https://www.seabios.org/): system and video BIOS

Their licence texts are in `licenses/`.

*Where in the World is Carmen Sandiego?* is © Brøderbund Software, and Windows 98 is ©
Microsoft. Neither is licensed for redistribution by this project. This is a personal
preservation project.
