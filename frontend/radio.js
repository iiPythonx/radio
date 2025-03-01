new (class {
    constructor() {
        this.websocket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/stream`);
        this.websocket.addEventListener("open", () => {
            this.websocket.addEventListener("message", (e) => {
                const data = JSON.parse(e.data);
                this.receive(data);
            });
        });

        this.audio = new Audio();
        this.audio.addEventListener("canplay", async () => {
            try {
                if (this.audio.paused) await this.audio.play();
    
            } catch (e) {
                document.querySelector("span:first-child").innerText = "Click anywhere.";
                document.addEventListener("click", () => {
                    if (!this.audio.paused) return;
                    this.audio.play();
                    this.force_sync = true;
                    if (document.querySelector("footer").children.length === 2) document.querySelector("span:first-child").remove();
                });
            }
        });

        this.should_sync = true;
    }

    seconds(s) {
        const minutes = Math.floor(s / 60);
        return `${String(minutes).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }

    update_progress(length) {
        document.querySelector("progress").value = this.audio.currentTime;
        document.querySelector("progress").max = length;
        document.querySelector("#progress").innerText = `${this.seconds(Math.round(this.audio.currentTime))} / ${this.seconds(Math.round(length))}`;
    }

    receive(payload) {
        const { type, data } = payload;
        switch (type) {
            case "update":
                this.audio.src = `/audio/${data.file}`;
                this.audio.load();

                // Update UI
                if (this.interval) clearInterval(this.interval);

                this.update_progress(data.length);
                this.interval = setInterval(() => this.update_progress(data.length), 100);
                
                document.querySelector("#song-name").innerText = data.name;

                // Hook up download button
                document.querySelector("#download").addEventListener("click", () => {
                    window.location.assign(this.audio.src);
                });
                return;

            case "clock":
                const lag = Math.round((data.time - this.audio.currentTime) * 1000);
                if ((lag > 250 || this.force_sync) && this.should_sync) {
                    this.audio.currentTime = data.time;
                    this.sync_attempts++;
                    if (this.sync_attempts > 4) {
                        alert("Failed to sync 4+ times, check your connection.");
                        this.should_sync = false;
                    }
                };
                this.force_sync = false;
                if (!this.audio.paused) document.querySelector("footer span:last-child").innerText = `${lag}ms`;
        }
    }
});
