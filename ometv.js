(function () {
    var currentIP = null;
    var lastLookupTime = 0;
    var MIN_LOOKUP_GAP_MS = 1000;
    var lookupHistory = [];
    var MAX_HISTORY = 6;

    var apis = [
        { name: "ipapi.co", url: ip => `https://ipapi.co/${ip}/json/` },
        { name: "ipwho.is", url: ip => `https://ipwho.is/${ip}` },
        { name: "ipinfo.io", url: ip => `https://ipinfo.io/${ip}/json` },
        { name: "ipapi.is", url: ip => `https://api.ipapi.is/?q=${ip}` }
    ];

    function fetchSafe(url, timeout = 3000) {
        return Promise.race([
            fetch(url).then(async r => {
                const text = await r.text();
                try { return JSON.parse(text); } catch { return null; }
            }),
            new Promise((_, reject) => setTimeout(() => reject(), timeout))
        ]);
    }

    function lookupIP(ip) {
        const now = Date.now();
        if (now - lastLookupTime < MIN_LOOKUP_GAP_MS) return;
        lastLookupTime = now;

        const el = document.getElementById("geo-info");
        el.innerHTML = `<div style="text-align:center;padding:20px;color:#9ca3af;">Resolving ${ip}...</div>`;

        Promise.any(
            apis.map(api =>
                fetchSafe(api.url(ip))
                    .then(data => data ? ({ api: api.name, data }) : Promise.reject())
            )
        )
        .then(r => render(ip, r.data, r.api))
        .catch(() => minimal(ip));
    }

    function minimal(ip) {
        document.getElementById("geo-info").innerHTML =
            `<div style="text-align:center;color:#9ca3af;">${ip}<br><small>No data</small></div>`;
    }

    function render(ip, d, source) {
        const city = d.city || d.regionName || "Unknown";
        const country = d.country || d.country_name || "Unknown";
        const isp = d.isp || d.org || "Unknown";
        const lat = d.latitude || d.lat;
        const lon = d.longitude || d.lon;

        const map = (lat && lon) ? `
            <div style="margin-top:10px;border-radius:8px;overflow:hidden;border:1px solid #1f2937;">
                <img src="https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=10&l=map&size=300,140"
                     style="width:100%;height:140px;object-fit:cover;">
            </div>` : "";

        document.getElementById("geo-info").innerHTML = `
            ${row("IP", ip)}
            ${row("Location", city)}
            ${row("Country", country)}
            ${row("ISP", isp)}
            ${map}
            <div style="font-size:11px;color:#6b7280;text-align:right;margin-top:6px;">${source}</div>
        `;

        addHistory(ip, country, isp);
    }

    function row(l, v) {
        return `<div style="display:flex;justify-content:space-between;margin:5px 0;">
            <span style="color:#6b7280">${l}</span>
            <span style="color:#e5e7eb">${v}</span>
        </div>`;
    }

    function addHistory(ip, country, isp) {
        lookupHistory.unshift({ ip, country, isp });
        if (lookupHistory.length > MAX_HISTORY) lookupHistory.pop();

        document.getElementById("history-list").innerHTML =
            lookupHistory.map(h => `
                <div style="padding:6px 0;border-bottom:1px solid #1f2937;font-size:12px;">
                    <div style="color:#e5e7eb">${h.ip}</div>
                    <div style="color:#6b7280">${h.country} • ${h.isp}</div>
                </div>`).join("");
    }

    let box = document.createElement('div');
    box.id = "brainome-box";

    Object.assign(box.style, {
        position: "fixed",
        top: "30px",
        left: "30px",
        width: "300px",
        background: "#0b0b0c",
        border: "1px solid #1f2937",
        borderRadius: "12px",
        color: "#e5e7eb",
        fontFamily: "system-ui",
        zIndex: "999999",
        cursor: "grab",
        userSelect: "none"
    });

    box.innerHTML = `
        <div id="drag-handle" style="padding:12px;border-bottom:1px solid #1f2937;font-weight:600;">
            Brainome
        </div>
        <div id="geo-info" style="padding:12px;font-size:13px;">Waiting for IP...</div>
        <div style="padding:10px;border-top:1px solid #1f2937;max-height:120px;overflow:auto;">
            <div id="history-list"></div>
        </div>
    `;

    document.body.appendChild(box);

    let isDragging = false, offsetX, offsetY;

    document.getElementById("drag-handle").addEventListener("mousedown", e => {
        isDragging = true;
        offsetX = e.clientX - box.offsetLeft;
        offsetY = e.clientY - box.offsetTop;
        box.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", e => {
        if (!isDragging) return;
        box.style.left = (e.clientX - offsetX) + "px";
        box.style.top = (e.clientY - offsetY) + "px";
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        box.style.cursor = "grab";
    });

    const OriginalRTCPeerConnection = window.RTCPeerConnection;
    if (!OriginalRTCPeerConnection) return;

    window.RTCPeerConnection = function (...args) {
        const pc = new OriginalRTCPeerConnection(...args);
        const orig = pc.addIceCandidate;

        pc.addIceCandidate = function (c) {
            if (c?.candidate) {
                const m = c.candidate.match(/ (\d+\.\d+\.\d+\.\d+) /);
                const ip = m?.[1];
                if (ip && ip !== currentIP) {
                    currentIP = ip;
                    lookupIP(ip);
                }
            }
            return orig?.apply(pc, arguments);
        };
        return pc;
    };

})();
