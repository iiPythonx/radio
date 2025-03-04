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
            this.ping_times = [];
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
        this.ping_times = [];
        this.websocket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/stream`);
        this.websocket.addEventListener("open", () => {
            this.websocket.addEventListener("message", (e) => {
                const data = JSON.parse(e.data);
                this.receive(data);
            });

            // Handle syncing
            if (this.sync_interval) clearInterval(this.interval);

            this.sync();
            this.sync_interval = setInterval(() => this.sync(), 1000);
        });
        this.websocket.addEventListener("close", () => {
            document.querySelector("#lag").className = "red";
            document.querySelector("#lag").innerText = "Connection lost";
            clearInterval(this.sync_interval);
            setTimeout(() => this.connect(), 5000);
        });
        if (this.admin) this.admin.connect(this.websocket);
    }

    sync() {
        this.sync_started = performance.now();
        this.websocket.send(JSON.stringify({ type: "position" }));
    }

    seconds(s) {
        const minutes = Math.floor(s / 60);
        return `${String(minutes).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }

    update_progress(length) {
        length /= 1000;
        document.querySelector("progress").value = this.audio.currentTime;
        document.querySelector("progress").max = length;
        document.querySelector("#progress").innerText = `${this.seconds(Math.round(this.audio.currentTime))} / ${this.seconds(Math.round(length))}`;
    }

    receive(payload) {
        const { type, data } = payload;
        switch (type) {
            case "position":
                const accurate_position = data.elapsed + ((performance.now() - this.sync_started) / 2);
                const lag = Math.round(Math.abs((accurate_position / 1000) - this.audio.currentTime)) * 1000;
                if (lag > 100) this.audio.currentTime = accurate_position / 1000;
                this.ping_times.push(this.ping_times.length ? lag : 0);
                console.warn(`L: ${this.ping_times.at(-1).toFixed(2)} | P: ${(accurate_position / 1000).toFixed(1)} | A: ${this.audio.currentTime.toFixed(1)}`);
                
                // Show ping times
                if (this.ping_times.length > 100) this.ping_times.splice(0, 1);
                if (!this.audio.paused) {
                    document.querySelector("#lag").className =
                        lag >= 250 ? "red" :
                        lag >= 150 ? "yellow" :
                        "green";

                    if (this.ping_times.length <= 5) {
                        document.querySelector("#lag").innerText = `Connected (${lag}ms)`;
                    } else {
                        document.querySelector("#lag").innerText =
                            `Connected (${lag}ms; Lowest: ${Math.min(...this.ping_times)}ms, Highest: ${Math.max(...this.ping_times)}ms, Avg: ${Math.round(this.ping_times.reduce((total, num) => total + num, 0) / this.ping_times.length)}ms)`;
                    }
                }
                break;

            case "update":
                this.audio.src = `/audio/${data.file}`;
                this.audio.load();

                this.update_pushed = true;
                this.force_sync = true;

                // Update UI
                if (this.interval) clearInterval(this.interval);

                this.update_progress(data.length);
                this.interval = setInterval(() => this.update_progress(data.length), 100);

                document.querySelector("#song-name").innerText = data.name;
                break;

            case "heartbeat":
                const users = data.user_count, voters = data.vote_count;
                document.querySelector("#listeners").innerText = `${users} ${users == 1 && "person" || "people"} listening along.`;
                document.querySelector("footer").innerText = `${this.voted ? "voted" : "voteskip"} (${voters}/${Math.ceil(users * (data.vote_ratio / 100))})`;
                if (!voters) this.voted = false;
        }
    }
});
