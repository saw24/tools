/* script.js
 * Dépendance: jQuery
 *
 * Approach:
 *  - pingTest(): multiple small requests to measure RTT and jitter
 *  - downloadTest(url): fetch a file (cache-busted), measure bytes/time
 *  - uploadTest(url): POST a generated Blob and measure bytes/time
 *  - drawGauge(): simple Canvas gauge that animates smoothly to target values
 *
 * IMPORTANT:
 *  - For reliable upload measurement, use your own server endpoint that accepts CORS POST.
 *  - If upload POST fails due to CORS or unavailable endpoint, fallback to a simulated upload test.
 */

$(function () {
    // --- Configuration / Servers ---
    const SERVERS = [
        {
            name: "Megamore Broadband",
            location: "Kano",
            downloadUrl: "https://speed.hetzner.de/100MB.bin",
            uploadUrl: "https://httpbin.org/post" // public test endpoint (may impose CORS limitations)
        },
        // Tu peux ajouter tes propres serveurs ici (downloadUrl doit pointer vers un fichier binaire, uploadUrl vers un endpoint acceptant POST & CORS)
    ];

    let server = SERVERS[0];

    // DOM shortcuts
    const $ping = $('#ping'), $jitter = $('#jitter'), $loss = $('#loss');
    const $downloadResult = $('#download-result'), $uploadResult = $('#upload-result');
    const $bigNumber = $('#big-number'), $goBtn = $('#goBtn');
    const canvas = document.getElementById('gauge');
    const ctx = canvas.getContext('2d');

    // Gauge state
    const MAX_SPEED = 500; // Mbps scale
    let gaugeState = { download: 0, upload: 0, animDownload: 0, animUpload: 0 };

    // initial UI
    $('#server-name').text(server.name);
    $('#server-location').text(server.location);

    /**************** Canvas Gauge ****************/
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const centerX = WIDTH / 2;
    const centerY = HEIGHT * 0.65;
    const radiusOuter = Math.min(WIDTH, HEIGHT) * 0.42;
    const radiusInner = radiusOuter - 28;


    // Draw initial gauge
    drawGauge();

    // Event
    $goBtn.on('click', runAllTests);

    /**************** Tests ****************/
    async function runAllTests() {
        setUIRunning(true);
        setResults('--', '--', '--', '--');

        try {
            // ping (multiple)
            const pingStats = await pingTest(server.downloadUrl, 5, 2000);
            $ping.text(pingStats.avg.toFixed(0) + ' ms');
            $jitter.text(pingStats.jitter.toFixed(0) + ' ms');

            // download
            const dl = await downloadTest(server.downloadUrl);
            $downloadResult.text(dl.mbps.toFixed(2) + ' Mbps');
            gaugeState.download = clamp(dl.mbps, 0, MAX_SPEED);
            $bigNumber.text(dl.mbps.toFixed(2));
            animateTo(gaugeState.download, gaugeState.upload);

            // upload
            const up = await uploadTest(server.uploadUrl, 5 * 1024 * 1024); // 5MB
            if (up.simulated) {
                $uploadResult.text(up.mbps.toFixed(2) + ' Mbps (simulé)');
            } else {
                $uploadResult.text(up.mbps.toFixed(2) + ' Mbps');
            }
            gaugeState.upload = clamp(up.mbps, 0, MAX_SPEED);
            animateTo(gaugeState.download, gaugeState.upload);

            $loss.text('0 %'); // placeholder
        } catch (err) {
            console.error('Test error', err);
            alert('Erreur pendant les tests : ' + (err.message || err));
        } finally {
            setUIRunning(false);
        }
    }

    function setUIRunning(isRunning) {
        if (isRunning) {
            $goBtn.text('Testing...').prop('disabled', true).addClass('running');
        } else {
            $goBtn.text('GO').prop('disabled', false).removeClass('running');
        }
    }
    function setResults(dl, up, pingVal, jitterVal) {
        $downloadResult.text(dl);
        $uploadResult.text(up);
        $ping.text(pingVal);
        $jitter.text(jitterVal);
    }

    // Helpful utilities
    function nowMs() { return performance && performance.now ? performance.now() : Date.now(); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /** pingTest
     *  Performs N HEAD requests (or small GET) to measure RTT
     *  returns {times:[], avg, jitter}
     */
    async function pingTest(url, attempts = 4, timeout = 2000) {
        const times = [];
        for (let i = 0; i < attempts; i++) {
            const t1 = nowMs();
            try {
                // Append cache-bust
                const u = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now() + Math.random();
                await fetch(u, { method: 'HEAD', cache: 'no-store', mode: 'no-cors', keepalive: false });
                // Note: mode:'no-cors' will not produce a readable response in many cases, but the browser still issues the request.
            } catch (e) {
                // In many cross-origin cases, fetch with no-cors will reject or succeed opaque; we still measure elapsed time.
            }
            const t2 = nowMs();
            times.push(t2 - t1);
            await sleep(120);
        }
        // compute avg and jitter (std dev of consecutive diffs)
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        let diffs = [];
        for (let i = 1; i < times.length; i++) diffs.push(Math.abs(times[i] - times[i - 1]));
        const jitter = diffs.length ? (diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0;
        return { times, avg, jitter };
    }

    /** downloadTest
     *  downloads the resource and measures bytes/time
     *  returns {bytes, seconds, mbps}
     */
    async function downloadTest(url) {
        const cacheBusted = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now() + Math.random();
        const t0 = nowMs();
        const reponse = await fetch(cacheBusted, { method: 'GET', cache: 'no-store' });
        const blob = await reponse.blob();
        const t1 = nowMs();
        const seconds = Math.max(0.0001, (t1 - t0) / 1000);
        const bytes = blob.size || (1024 * 1024 * 50); // fallback guess if size unknown
        const mbps = (bytes * 8) / (seconds * 1000 * 1000);
        return { bytes, seconds, mbps };
    }

    /** uploadTest
     *  posts a generated blob to the given endpoint, measures time
     *  returns {bytes, seconds, mbps, simulated}
     *
     *  If the POST fails due to CORS or network, returns a simulated value.
     */
    async function uploadTest(url, bytesToSend = 5 * 1024 * 1024) {
        // create blob of random bytes
        const size = bytesToSend;
        const arr = new Uint8Array(size);
        crypto.getRandomValues(arr);
        const blob = new Blob([arr], { type: 'application/octet-stream' });

        const t0 = nowMs();
        try {
            // Attempt to POST
            const resp = await fetch(url, {
                method: 'POST',
                body: blob,
                mode: 'cors',
                cache: 'no-store'
            });
            const t1 = nowMs();
            const seconds = Math.max(0.0001, (t1 - t0) / 1000);
            const mbps = (size * 8) / (seconds * 1000 * 1000);
            // If response is opaque or not ok, still calculate based on time
            return { bytes: size, seconds, mbps, simulated: false };
        } catch (err) {
            console.warn('Upload POST failed (likely CORS) - fallback to simulated upload', err);
            // Fallback simulation: emulate an upload speed between 5 and 50 Mbps based on random
            const simulatedMbps = 5 + Math.random() * 45;
            await sleep(600 + Math.random() * 800);
            return { bytes: size, seconds: (size * 8) / (simulatedMbps * 1000 * 1000), mbps: simulatedMbps, simulated: true };
        }
    }

    /**************** Canvas Gauge ****************/
    /*const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const centerX = WIDTH / 2;
    const centerY = HEIGHT * 0.65;
    const radiusOuter = Math.min(WIDTH, HEIGHT) * 0.42;
    const radiusInner = radiusOuter - 28;*/

    let lastAnimate = null;
    function drawGauge() {
        // Clear
        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        // background arc (grey)
        drawArc(-Math.PI * 0.9, Math.PI * 0.1, radiusOuter, '#16212b', 30, 0.14);

        // scale ticks and numbers
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.font = '12px Montserrat';
        for (let i = 0; i <= 5; i++) {
            const t = i / 5;
            const angle = -Math.PI * 0.9 + t * (Math.PI * 1.0);
            const x = Math.cos(angle) * (radiusOuter + 16);
            const y = Math.sin(angle) * (radiusOuter + 16);
            ctx.fillText(Math.round(t * MAX_SPEED), x - 10, y + 4);
        }
        ctx.restore();

        // Download arc (turquoise)
        const dFrac = gaugeState.animDownload / MAX_SPEED;
        drawArc(-Math.PI * 0.9, -Math.PI * 0.9 + dFrac * (Math.PI * 1.0), radiusOuter, null, 18, null, true, true);

        // Upload arc (violet) - inner smaller arc
        const uFrac = gaugeState.animUpload / MAX_SPEED;
        drawArc(-Math.PI * 0.9, -Math.PI * 0.9 + uFrac * (Math.PI * 1.0), radiusInner, null, 12, null, false, false);

        // center decoration ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, radiusInner - 36, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.01)';
        ctx.fill();
    }

    function drawArc(startAngle, endAngle, radius, color, lineWidth = 14, alpha = null, gradient = false, bright = false) {
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineWidth = lineWidth;
        const grad = ctx.createLinearGradient(0, 0, WIDTH, 0);
        grad.addColorStop(0, 'transparent');
        if (gradient) {
            // download gradient turquoise
            const g = ctx.createLinearGradient(0, 0, WIDTH, 0);
            g.addColorStop(0, 'rgba(43,225,214,0.05)');
            g.addColorStop(0.3, 'rgba(43,225,214,0.35)');
            g.addColorStop(1, 'rgba(43,225,214,0.9)');
            ctx.strokeStyle = g;
        } else if (!gradient && !bright) {
            // subtle violet
            const g = ctx.createLinearGradient(0, 0, WIDTH, 0);
            g.addColorStop(0, 'rgba(213,124,255,0.2)');
            g.addColorStop(1, 'rgba(213,124,255,0.9)');
            ctx.strokeStyle = g;
        } else {
            // default color param or bright
            ctx.strokeStyle = color || 'rgba(255,255,255,0.2)';
        }
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.stroke();
    }

    // Numeric animation
    function animateTo(targetD, targetU) {
        // animate animDownload / animUpload towards target
        const start = { d: gaugeState.animDownload, u: gaugeState.animUpload };
        const dur = 900;
        const t0 = nowMs();

        function step(now) {
            const t = clamp((now - t0) / dur, 0, 1);
            const ease = easeOutCubic(t);
            gaugeState.animDownload = start.d + (targetD - start.d) * ease;
            gaugeState.animUpload = start.u + (targetU - start.u) * ease;
            $bigNumber.text(gaugeState.animDownload.toFixed(2));
            drawGauge();
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // continuous small easing loop to keep gauge alive while animating
    function loop(now) {
        if (!lastAnimate) lastAnimate = now;
        // subtle decay or update can go here
        drawGauge();
        lastAnimate = now;
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); };

    /**************** Helpers ****************/
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // End of file
});
