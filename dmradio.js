// Copyright (c) 2025 iiPython

// Bypass innerText restrictions
Object.defineProperty(bios.terminal._stdoutFrame, "innerText", {
    set: function (v) { this.innerHTML = v; },
    get: function () { return this.textContent; }
});

// Setup radio command
bios.register({
    aliases: ["radio"],
    callback: (flags) => {
        const args = flags.get("");
        if (args.length) {
            switch (args[0]) {
                case "stop":
                    window.radio.audio.pause();
                    window.radio.ws.close();
                    const old = bios.console.stdout.buffer.split("\n");
                    old[0] = old[0].split(" | ")[0];
                    bios.console.stdout.buffer = old.join("\n");
                    delete window.radio, window.song_name;
                    break;
                case "volume":
                    const volume = Number(args[1]) / 100;
                    if (Number.isNaN(volume) || volume < 0 || volume > 1) return bios.console.print("Volume must be between 0-100!");
                    window.radio.audio.volume = volume;
                    break;
                case "skip":
                    window.radio.ws.send("voteskip");
                    break;
                case "connect":
                    if (window.radio) return bios.console.print("Already connected!");
                    const update_title = (lag) => {
                        const lines = bios.console.stdout.buffer.split("\n");
                        const doc = (new DOMParser()).parseFromString(lines[0], "text/html");
                        lines.splice(0, 1, ...lines[0].split("<span></span>"));
                        bios.console.stdout.buffer = `<div style = "display: flex; align-items: center; height: fit-content;"><span>${(doc.body.innerText || "").split("|")[0]}</span><span style = "margin-left: auto;">| ${window.radio.name} (${lag})</span></div><span></span>` + lines.slice(1).join("\n");
                    };
                    
                    const audio = new Audio();
                    
                    const process_message = (message) => {
                        const { type, data } = JSON.parse(message.data);
                        switch (type) {
                            case "update":
                                audio.src = `https://radio.iipython.dev/audio/${data.file}`;
                                audio.play();
                                window.radio.name = data.name;
                                update_title("Syncing");
                                break;
            
                            case "heartbeat":
                                data.time /= 1000;
                                const lag = Math.round(Math.abs(data.time - audio.currentTime) * 1000);
                                if (lag > 250) audio.currentTime = data.time;
                                window.radio.lag = lag;
                                window.radio.data = data;
                                update_title(`${lag}ms`);
                        }
                    }
            
                    bios.console.print("Now connecting..");
                    const ws = new WebSocket("wss://radio.iipython.dev/stream");
                    ws.addEventListener("open", () => {
                        ws.addEventListener("message", process_message);
                    });
                    window.radio = { audio, ws, lag: null, name: null, data: {} };
            }
            return;
        }

        bios.console.print("== iiPython Radio ==\nCommand usage\n    radio [connect/volume/skip/stop]\n");
        bios.console.print(`Statistics\n    <span style = "color: ${window.radio ? 'green' : 'red'};">${window.radio ? 'Connected' : 'Not connected'}</span>`);
        if (window.radio) {
            const { votes, users } = window.radio.data;
            bios.console.print(`    ${window.radio.name} - ${votes}/${Math.ceil(users / 2)} votes to skip`);
        }
    },
    description: "Tune in to iiPython Radio.",
    details: "No details needed, get some brain cells."
});

