// Downloads the game's CD data in the background once the game is running, so speech,
// sounds and pictures don't wait on the network the first time they're used. The
// downloads go through the service worker (sw.js), which keeps them on the device, so
// later visits skip anything already saved. The list of chunks, most useful first, comes
// from config.json (written by scripts/build-static.mjs).

const WORKERS = 2; // few enough that the game's own requests still get through quickly

export async function preload(urls, onProgress) {
    if (navigator.connection?.saveData) {
        onProgress("skipped: Data Saver is on");
        return;
    }
    if (!("serviceWorker" in navigator) || !("caches" in window)) {
        onProgress("not supported in this browser");
        return;
    }
    // Only worth doing once the service worker is handling requests; before that the
    // downloads wouldn't be kept.
    if (!navigator.serviceWorker?.controller) {
        await new Promise(resolve => navigator.serviceWorker?.addEventListener("controllerchange", resolve, { once: true }));
    }

    const total = urls.length;
    const queue = [...urls];
    let saved = 0;
    let failed = 0;
    const report = () => onProgress(`${saved} of ${total} pieces saved on this device${failed ? `, ${failed} failed` : ""}`);

    async function worker() {
        while (queue.length) {
            const url = new URL(queue.shift(), location.href).href;
            try {
                if (!(await caches.match(url))) {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(response.status);
                    await response.arrayBuffer();
                }
                saved++;
            } catch {
                failed++;
            }
            report();
        }
    }

    report();
    await Promise.all(Array.from({ length: WORKERS }, worker));
}
