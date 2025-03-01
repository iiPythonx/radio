new (class {
    constructor() {
        this.audio = new Audio();
        this.websocket = new WebSocket("ws://localhost:8000/stream");
        this.websocket.addEventListener("open", () => {
            this.websocket.addEventListener("message", (e) => {
                const data = JSON.parse(e.data);
                this.now_playing(data);
            });
            this.sync_start = Date.now();
            this.websocket.send("");
        });
    }

    seconds(s) {
        const minutes = Math.floor(s / 60);
        return `${String(minutes).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }

    update_progress() {
        document.querySelector("progress").value = this.audio.currentTime;
        document.querySelector("progress").max = this.song.length;
        document.querySelector("#progress").innerText = `${this.seconds(Math.round(this.audio.currentTime))} / ${this.seconds(Math.round(this.song.length))}`;
    }

    interact() {
        document.querySelector("span:first-child").innerText = "Click anywhere to bypass autoplay.";
        document.addEventListener("click", () => {
            this.audio.play();
            document.querySelector("span:first-child").remove();
        });
    }

    sync(position) {
        if (this.audio.paused) return;
        this.audio.currentTime = position;
        console.log("Resynced");
    }

    async now_playing(data) {
        if (this.song && data.file === this.song.file) {
            let latency = Math.round((data.position - this.audio.currentTime) * 1000);
            console.log(data.position, this.audio.currentTime, this.audio.paused);
            if (latency > 500) this.sync(data.position);
            if (!this.audio.paused) document.querySelector("footer span:last-child").innerText = `${latency}ms`;
            return;
        }

        this.audio.src = `/audio/${data.file}`;
        this.audio.currentTime = data.position;

        // This sucks.
        try {
            if (this.audio.paused && (data.file === this.song.file) || !this.song) await this.audio.play();
            document.querySelector("dialog").open = false;
        } catch { if (!this.song || (this.song && data.file === this.song.file)) this.interact(); }

        // Hook up download button
        document.querySelector("#download").addEventListener("click", () => {
            window.location.assign(this.audio.src);
        });

        // Update UI
        if (this.interval) clearInterval(this.interval);
        this.song = data;

        this.update_progress();
        this.interval = setInterval(() => this.update_progress(), 100);
        
        document.querySelector("#song-name").innerText = data.name;
    }
});
