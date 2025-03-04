new (class {
    constructor() {
        this.connect();

        // Setup audio instance
        this.audio = new Audio();
        this.audio.addEventListener("canplay", async () => {
            try {
                if (!this.update_pushed) return;
                if (this.audio.paused) await this.audio.play();
                this.update_pushed = false;
    
            } catch (e) {
                const warning = document.querySelector("#click-warning")
                warning.innerText = "Click anywhere.";
                document.addEventListener("click", () => {
                    if (!this.audio.paused) return;
                    this.audio.play();
                    this.force_sync = true;
                    warning.innerText = "";
                });
            }
        });

        // Setup volume control
        const volume_control = document.querySelector(`input[type = "range"]`);
        const volume = (v) => this.audio.volume = v / 100;

        volume_control.addEventListener("input", (e) => {
            volume(e.currentTarget.value);
            localStorage.setItem("volume", e.currentTarget.value);
        });

        const existing_volume = +(localStorage.getItem("volume") || 75);
        volume_control.value = existing_volume;
        volume(existing_volume);

        // Setup audioMotion.js
        new AudioMotionAnalyzer(
            document.querySelector("#visualizer"),
            {
                source: this.audio,
                ansiBands: true,
                connectSpeakers: true,
                mode: 4,
                gradient: "steelblue",
                overlay: true,
                showBgColor: false,
                showPeaks: false,
                showScaleX: false,
                smoothing: 0.8
            }
        );

        // Handle constant & connecting download button
        this.should_sync = true;
        document.querySelector("#download").addEventListener("click", () => {
            window.location.assign(this.audio.src);
        });

        // Handle voteskipping
        document.querySelector("footer").addEventListener("click", () => {
            this.websocket.send(JSON.stringify({ type: "voteskip" }));
            this.voted = !this.voted;
            document.querySelector("footer").innerText = document.querySelector("footer").innerText.replace(
                this.voted ? "voteskip" : "voted",
                this.voted ? "voted": "voteskip"
            );
        });

        // Handle force resyncing
        document.querySelector("#lag").addEventListener("click", (e) => {
            if (this.websocket.readyState !== WebSocket.OPEN) return;
            e.currentTarget.innerText = "Syncing";
            this.force_sync = true;
            this.reset_sync();
        });

        // Admin interface
        document.addEventListener("keydown", async (e) => {
            if (e.key === "/" && e.ctrlKey) {
                e.preventDefault();
                if (this.admin) return this.admin.toggle();
                this.admin = new (await import("/js/admin.js")).AdminInterface(this.websocket);
            }
        });
    }

    connect() {
        this.reset_sync();
        this.websocket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/stream`);
        this.websocket.addEventListener("open", () => {
            this.websocket.addEventListener("message", (e) => {
                const data = JSON.parse(e.data);
                this.receive(data);
            });
        });
        this.websocket.addEventListener("close", () => {
            document.querySelector("#lag").className = "red";
            document.querySelector("#lag").innerText = "Connection lost";
            setTimeout(() => this.connect(), 5000);
        });
        if (this.admin) this.admin.connect(this.websocket);
    }

    reset_sync() {
        this.total = 0, this.pings = 0, this.lowest = 0, this.lowest = Infinity, this.highest = -Infinity;
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
                this.audio.currentTime = 0;

                this.update_pushed = true;

                // Update UI
                if (this.interval) clearInterval(this.interval);

                this.update_progress(data.length);
                this.interval = setInterval(() => this.update_progress(data.length), 100);

                document.querySelector("#song-name").innerText = data.name;
                break;

            case "heartbeat":
                const time = data.time;
                const lag = Math.abs(Math.round((time - this.audio.currentTime) * 1000));

                this.pings += 1;
                if (this.pings >= 5) {
                    this.total += lag;
                    if (lag < this.lowest) { this.lowest = lag; }
                    if (lag > this.highest) { this.highest = lag; }
                }

                if ((lag > 250 || this.force_sync) && this.should_sync) {
                    this.audio.currentTime = time;
                    this.sync_attempts++;
                    if (this.sync_attempts > 4) {
                        alert("Failed to sync 4+ times, check your connection.");
                        this.should_sync = false;
                    }
                };

                this.force_sync = false;
                if (!this.audio.paused) {
                    document.querySelector("#lag").className =
                        lag >= 250 ? "red" :
                        lag >= 150 ? "yellow" :
                        "green";

                    if (this.pings <= 5) {
                        document.querySelector("#lag").innerText = `Connected (${lag}ms)`;
                    } else {
                        document.querySelector("#lag").innerText =
                            `Connected (${lag}ms; Lowest: ${this.lowest}ms, Highest: ${this.highest}ms, Avg: ${Math.round(this.total / this.pings)}ms)`;
                    }
                }

                document.querySelector("#listeners").innerText = `${data.users} ${data.users == 1 && "person" || "people"} listening along.`;
                document.querySelector("footer").innerText = `${this.voted ? "voted" : "voteskip"} (${data.votes}/${Math.ceil(data.users * (data.vote_ratio / 100))})`;
                if (data.votes === 0) this.voted = false;
        }
    }
});
