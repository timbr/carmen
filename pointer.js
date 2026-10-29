// Makes Windows' pointer follow the host pointer without capturing it. Windows 98 here
// only takes relative PS/2 movement (VBMOUSE's absolute mode crashes it), so this sends
// the movement itself: whenever the host pointer enters the screen it pins Windows'
// pointer to the top-left corner, then moves it by exact pixel differences. Needs the
// Windows pointer speed at its slowest, which turns off acceleration so that one
// movement count is one pixel.

const MAX_STEP = 255; // the largest movement one PS/2 packet can carry
const POLL_MS = 4;
const TRACKPAD_SPEED = 1.5; // Windows' pointer moves this much faster than the finger
const TAP_SLOP = 10; // a touch that moves less than this many page pixels is a tap
const TAP_MS = 300; // and must also be shorter than this

export function trackPointer(emulator, canvas) {
    // v86's own handler sends unscaled movement and expects the pointer to be captured.
    emulator.mouse_adapter.emu_enabled = false;
    canvas.style.cursor = "none";
    canvas.style.touchAction = "none";

    const ps2 = emulator.v86.cpu.devices.ps2;

    // Windows loses packets that arrive while earlier ones are still unread, so actions
    // are queued and each packet is sent only once the PS/2 buffer is empty. Moves and
    // button changes share the queue so a click can't overtake the move before it.
    const queue = [];
    let draining = false;

    function enqueueMove(dx, dy, pin = false) {
        if (!dx && !dy) return;
        const last = queue.at(-1);
        // Merge with a queued move, but never with a pin: that relies on overshooting the
        // corner before moving back out.
        if (!pin && last?.type === "move" && !last.pin) {
            last.dx += dx;
            last.dy += dy;
        } else {
            queue.push({ type: "move", dx, dy, pin });
        }
        drain();
    }

    function enqueue(action) {
        queue.push(action);
        drain();
    }

    function drain() {
        if (!draining) {
            draining = true;
            setTimeout(step, 0);
        }
    }

    function step() {
        if (ps2.mouse_buffer.length === 0 && queue.length) {
            const action = queue[0];
            if (action.type === "move") {
                const stepX = Math.max(-MAX_STEP, Math.min(MAX_STEP, action.dx));
                const stepY = Math.max(-MAX_STEP, Math.min(MAX_STEP, action.dy));
                if (stepX || stepY) emulator.bus.send("mouse-delta", [stepX, -stepY]); // PS/2 y points up
                action.dx -= stepX;
                action.dy -= stepY;
                if (!action.dx && !action.dy) queue.shift();
            } else {
                emulator.bus.send(action.type, action.data);
                queue.shift();
            }
        }
        if (queue.length) {
            setTimeout(step, POLL_MS);
        } else {
            draining = false;
        }
    }

    // Where Windows' pointer is, in screen pixels, and the screen size that was measured
    // against. Null until re-synced.
    let guest = null;

    function moveTo(event) {
        const rect = canvas.getBoundingClientRect();
        const width = canvas.width;
        const height = canvas.height;
        // Windows stops its pointer at the screen edges, so clamp the same way.
        const x = Math.max(0, Math.min(width - 1, Math.round((event.clientX - rect.left) * width / rect.width)));
        const y = Math.max(0, Math.min(height - 1, Math.round((event.clientY - rect.top) * height / rect.height)));
        if (!guest || guest.width !== width || guest.height !== height) {
            // Pin to the top-left corner; anything past the edge is simply absorbed.
            enqueueMove(-(width + MAX_STEP), -(height + MAX_STEP), true);
            guest = { x: 0, y: 0, width, height };
        }
        enqueueMove(x - guest.x, y - guest.y);
        guest.x = x;
        guest.y = y;
    }

    function sendButtons(event) {
        enqueue({
            type: "mouse-click",
            data: [Boolean(event.buttons & 1), Boolean(event.buttons & 4), Boolean(event.buttons & 2)],
        });
    }

    // Trackpad mode, for touch only: dragging moves Windows' pointer relative to where it
    // is, like a laptop touchpad, and a tap clicks there. Easier than putting a finger
    // exactly on Windows' small controls.
    let trackpad = false;
    let touch = null; // the finger currently on the screen in trackpad mode
    const usesTrackpad = event => trackpad && event.pointerType !== "mouse";

    function nudge(event) {
        const rect = canvas.getBoundingClientRect();
        const width = canvas.width;
        const height = canvas.height;
        if (!guest || guest.width !== width || guest.height !== height) {
            enqueueMove(-(width + MAX_STEP), -(height + MAX_STEP), true);
            guest = { x: 0, y: 0, width, height };
            enqueueMove(width >> 1, height >> 1);
            guest.x = width >> 1;
            guest.y = height >> 1;
        }
        // Scale finger movement into screen pixels, then speed it up a little.
        touch.fx += (event.clientX - touch.lastX) * width / rect.width * TRACKPAD_SPEED;
        touch.fy += (event.clientY - touch.lastY) * height / rect.height * TRACKPAD_SPEED;
        touch.lastX = event.clientX;
        touch.lastY = event.clientY;
        const x = Math.max(0, Math.min(width - 1, Math.round(guest.x + touch.fx)));
        const y = Math.max(0, Math.min(height - 1, Math.round(guest.y + touch.fy)));
        touch.fx -= Math.round(touch.fx);
        touch.fy -= Math.round(touch.fy);
        enqueueMove(x - guest.x, y - guest.y);
        guest.x = x;
        guest.y = y;
    }

    canvas.addEventListener("pointermove", event => {
        if (!usesTrackpad(event)) moveTo(event);
        else if (touch?.id === event.pointerId) {
            if (Math.hypot(event.clientX - touch.startX, event.clientY - touch.startY) > TAP_SLOP) touch.moved = true;
            nudge(event);
        }
    });
    // Movement outside the screen isn't seen, so re-sync on the way back in. (While a
    // button is held the pointer is captured, and this only fires once it's released.)
    canvas.addEventListener("pointerleave", event => {
        if (!event.buttons && !usesTrackpad(event)) guest = null;
    });
    canvas.addEventListener("pointerdown", event => {
        // Keep receiving movement while a button is held, even outside the screen.
        try {
            canvas.setPointerCapture(event.pointerId);
        } catch {} // the pointer may already be gone
        event.preventDefault();
        if (usesTrackpad(event)) {
            touch = {
                id: event.pointerId, time: event.timeStamp, moved: false, fx: 0, fy: 0,
                startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
            };
            return;
        }
        moveTo(event);
        sendButtons(event);
    });
    canvas.addEventListener("pointerup", event => {
        event.preventDefault();
        if (usesTrackpad(event)) {
            if (touch?.id === event.pointerId && !touch.moved && event.timeStamp - touch.time < TAP_MS) {
                if (!guest) nudge(event);
                enqueue({ type: "mouse-click", data: [true, false, false] });
                enqueue({ type: "mouse-click", data: [false, false, false] });
            }
            touch = null;
            return;
        }
        moveTo(event);
        sendButtons(event);
    });
    canvas.addEventListener("pointercancel", () => {
        touch = null;
    });
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    canvas.addEventListener("wheel", event => {
        enqueue({ type: "mouse-wheel", data: [-Math.sign(event.deltaY), 0] });
        event.preventDefault();
    }, { passive: false });

    return {
        setTrackpad(on) {
            trackpad = on;
            touch = null;
        },
    };
}
