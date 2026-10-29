// Lets touch devices type into Windows. A hidden text field brings up the device's
// on-screen keyboard, and what's typed into it is sent to Windows as key presses.
// Phone keyboards don't report real key codes for letters, so the field is compared
// with what it held before: added text is typed, missing characters are Backspaces.
// v86 itself ignores key events from text fields, so nothing is sent twice.

// Scancodes (make codes; v86 adds the release) for keys that don't produce text.
const KEYS = {
    Enter: [0x1C],
    Escape: [0x01],
    Tab: [0x0F],
    ArrowUp: [0xE0, 0x48],
    ArrowDown: [0xE0, 0x50],
    ArrowLeft: [0xE0, 0x4B],
    ArrowRight: [0xE0, 0x4D],
};
const BACKSPACE = [0x0E];

// The field always holds this, so a Backspace has something to delete.
const SENTINEL = "  ";

// Phone keyboards like typographic punctuation, which Windows' keyboard can't type.
const PLAIN = { "‘": "'", "’": "'", "“": "\"", "”": "\"", "–": "-", "—": "-", "…": "..." };

function press(emulator, codes) {
    const release = codes.length === 2 ? [codes[0], codes[1] | 0x80] : [codes[0] | 0x80];
    emulator.keyboard_send_scancodes([...codes, ...release]);
}

export function attachKeyboard(emulator, input) {
    const reset = () => {
        input.value = SENTINEL;
        input.setSelectionRange(SENTINEL.length, SENTINEL.length);
    };

    function sendChanges() {
        const value = input.value;
        if (value.startsWith(SENTINEL)) {
            const typed = [...value.slice(SENTINEL.length)].map(c => PLAIN[c] ?? c).join("");
            if (typed) emulator.keyboard_send_text(typed);
        } else {
            for (let i = value.length; i < SENTINEL.length; i++) press(emulator, BACKSPACE);
        }
        reset();
    }

    // While a word is being composed (predictive text), wait until it's committed.
    input.addEventListener("input", event => {
        if (!event.isComposing) sendChanges();
    });
    input.addEventListener("compositionend", sendChanges);
    input.addEventListener("keydown", event => {
        const codes = KEYS[event.key];
        if (codes) {
            press(emulator, codes);
            event.preventDefault();
        }
    });
    input.addEventListener("focus", reset);
    reset();

    return {
        toggle() {
            if (document.activeElement === input) input.blur();
            else input.focus();
        },
        get open() {
            return document.activeElement === input;
        },
    };
}
