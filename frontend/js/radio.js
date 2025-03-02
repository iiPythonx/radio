new (class {
    constructor() {
        this.websocket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/stream`);
        this.websocket.addEventListener("open", () => {
            this.websocket.addEventListener("message", (e) => {
                const data = JSON.parse(e.data);
                this.receive(data);
            });
        });

        // Setup audio instance
        this.audio = new Audio();
        this.audio.addEventListener("canplay", async () => {
            try {
                if (!this.update_pushed) return;
                if (this.audio.paused) await this.audio.play();
                this.update_pushed = false;
    
            } catch (e) {
                document.querySelector("#click-warning").innerText = "Click anywhere.";
                document.addEventListener("click", () => {
                    if (!this.audio.paused) return;
                    this.audio.play();
                    this.force_sync = true;
                    if (document.querySelector("#click-warning")) document.querySelector("#click-warning").remove();
                });
            }
        });

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
        this.total = 0, this.pings = 0, this.lowest = 0, this.lowest = Infinity, this.highest = -Infinity;
        document.querySelector("#download").addEventListener("click", () => {
            window.location.assign(this.audio.src);
        });

        // Handle voteskipping
        document.querySelector("footer").addEventListener("click", () => {
            this.websocket.send("voteskip");
            this.voted = !this.voted;
        });
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

                this.update_pushed = true;

                // Update UI
                if (this.interval) clearInterval(this.interval);

                this.update_progress(data.length);
                this.interval = setInterval(() => this.update_progress(data.length), 100);

                document.querySelector("#song-name").innerText = data.name;
                break;

            case "heartbeat":
                const lag = Math.abs(Math.round((data.time - this.audio.currentTime) * 1000));

                this.pings += 1;
                if (this.pings >= 5) {
                    this.total += lag;
                    if (lag < this.lowest) { this.lowest = lag; }
                    if (lag > this.highest) { this.highest = lag; }
                }

                if ((lag > 250 || this.force_sync) && this.should_sync) {
                    this.audio.currentTime = data.time;
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
                document.querySelector("footer").innerText = `${this.voted ? "voted" : "voteskip"} (${data.votes}/${Math.ceil(data.users / 2)})`;
                if (data.votes === 0) this.voted = false;
        }
    }
});
