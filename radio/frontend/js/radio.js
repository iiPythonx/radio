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
        document.querySelector("#download").addEventListener("click", () => {
            window.location.assign(this.audio.src);
        });

        // Handle voteskipping
        document.querySelector("#voteskip").addEventListener("click", () => {
            this.websocket.send(JSON.stringify({ type: "voteskip" }));
            this.voted = !this.voted;
            document.querySelector("#voteskip").innerText = document.querySelector("#voteskip").innerText.replace(
                this.voted ? "voteskip" : "voted",
                this.voted ? "voted": "voteskip"
            );
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

            this.sync_started = performance.now();
            this.websocket.send(JSON.stringify({ type: "position" }));
        });
        this.websocket.addEventListener("close", () => {
            document.querySelector("#voteskip").className = "red";
            document.querySelector("#voteskip").innerText = "Connection lost";
            setTimeout(() => this.connect(), 5000);
        });
        if (this.admin) this.admin.connect(this.websocket);
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
                this.audio.currentTime = (data.elapsed + ((performance.now() - this.sync_started) / 2)) / 1000;
                break;

            case "update":
                this.audio.src = `/audio/${data.file}`;
                this.audio.load();

                this.update_pushed = true;

                // Update UI
                if (this.interval) clearInterval(this.interval);

                this.update_progress(data.length);
                this.interval = setInterval(() => this.update_progress(data.length), 100);

                document.querySelector("#song-name").innerText = data.name;
                break;

            case "heartbeat":
                const users = data.user_count, voters = data.vote_count;
                if (!voters) this.voted = false;
                document.querySelector("#listeners").innerText = `${users} ${users == 1 && "person" || "people"} listening along.`;
                document.querySelector("#voteskip").className = "";
                document.querySelector("#voteskip").innerText = `${this.voted ? "voted" : "voteskip"} (${voters}/${Math.ceil(users * (data.vote_ratio / 100))})`;
        }
    }
});
