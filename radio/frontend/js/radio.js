console.log("%c iiPython Radio", "font-size: 40px");
console.log("Find any issues? Report them at https://github.com/iiPythonx/radio.");
console.log("");

class AudioProcessor {
    #audio;
    #audio_next;

    constructor() {
        this.#audio = new Audio();
        this.#audio.addEventListener("canplay", () => this.#audio_loaded());  // Fires for first song

        this.#audio_next = new Audio();

        // Setup audioMotion.js
        this.motion = new AudioMotionAnalyzer(
            document.querySelector("#visualizer"),
            {
                source: this.#audio,
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
    }

    #audio_loaded() {
        if (!this.elapsed_time) return;
        this.#audio.currentTime = (this.elapsed_time + (performance.now() - this.elapsed_epoch)) / 1000;
        console.log(`[Audio] Current time has been set to [${this.#audio.currentTime.toFixed(1)} second(s)].`);

        if (this.#audio.paused) this.#audio.play();
        delete this.elapsed_time, this.elapsed_epoch;
    }

    set_elapsed(elapsed) {
        this.elapsed_time = elapsed;
        this.elapsed_epoch = performance.now();

        this.#audio_loaded();
    }

    set_url(url) {
        if (url === decodeURI(this.#audio_next.src.split("/audio/")[1])) {
			const volume = this.#audio.volume;
            this.#audio.pause();
            this.motion.disconnectInput(this.#audio);
            this.#audio = this.#audio_next;
			this.#audio.volume = volume;

            this.#audio_next = new Audio();
            this.motion.connectInput(this.#audio);
        } else { this.#audio.src = `/audio/${url}`; }
    }

    preload_url(url) {
        console.log(`[Audio] Starting preload of [${url}]`);
        this.#audio_next.src = `/audio/${url}`;
        this.#audio_next.load();
    }

    volume(percentage) {
        this.#audio.volume = (101 ** (percentage / 100) - 1) / 100;
    }

    get time() {
        return this.#audio.currentTime;
    }

    get path() {
        return decodeURI(this.#audio.src.split("/audio/")[1]);
    }
}

new (class {
    constructor() {
        this.connect();
        this.audio = new AudioProcessor();

        // Setup volume control
        const volume_control = z("#vslide");
        volume_control.addEventListener("input", (e) => {
            this.audio.volume(e.currentTarget.value);
            localStorage.setItem("volume", e.currentTarget.value);
			z("#mute",   { text: e.currentTarget.value === "0" ? "/muted/" : "/mute/" });
			z("#volume", { text: `(${e.currentTarget.value}%)` });
        });
		
        const existing_volume = +(localStorage.getItem("volume") || 75);
        volume_control.value = existing_volume;
        this.audio.volume(existing_volume);
		z("#mute",   { text: existing_volume === "0" ? "/muted/" : "/mute/" });
		z("#volume", { text: `(${existing_volume}%)` });

		z("#mute").addEventListener("click", () => {
            this.audio.volume(0);
            localStorage.setItem("volume", 0);
			volume_control.value = 0;
			z("#mute",   { text: "/muted/" });
			z("#volume", { text: "(0%)"    });
		});
		
		// Update visualizer width
		z("#moder").addEventListener("click", () => {
			switch (this.audio.motion.mode) {
				case 0: case 1: case 2: case 3: case 4: case 5: {
					this.audio.motion.mode++;
					this.audio.motion.start();
					localStorage.setItem("moder", this.audio.motion.mode);
					z("#moder",      { text: `/visualizer:m${this.audio.motion.mode}/` });
					z("#visualizer", { style: { display: "none" } });
					break;
				}
				case 6: default: {
					this.audio.motion.mode = 0;
					this.audio.motion.stop();
					localStorage.setItem("moder", this.audio.motion.mode);
					z("#moder",      { text: "/visualizer:off/" });
					z("#visualizer", { style: { display: "none" } });
					break;
				}
			}
		});

        // Handle visualizer mode
		const existing_mode = +(localStorage.getItem("moder") ?? 4);
		switch (existing_mode) {
			case 1: case 2: case 3: case 4: case 5: case 6: {
				this.audio.motion.mode = existing_mode;
				z("#moder", { text: `/visualizer:m${this.audio.motion.mode}/` });
				break;
			}
			case 0: default: {
				this.audio.motion.mode = 0;
				this.audio.motion.stop();
				z("#visualizer", { style: { display: "none" } });
				z("#moder",      { text: "/visualizer:off/" });
				break;
			}
		}

        // Handle voteskipping
        z("#voteskip").addEventListener("click", () => {
            if (this.shift) this.websocket.send(JSON.stringify({ type: "downvote" }));
            this.websocket.send(JSON.stringify({ type: "voteskip" }));
            this.voted = !this.voted;
            z("#voteskip", { text: this.voted ? "/voted/" : "/voteskip/" });
        });

        // Admin interface
        document.addEventListener("keydown", async (e) => {
            if (e.key === "/" && e.ctrlKey) {
                e.preventDefault();
                if (this.admin) return this.admin.toggle();
                this.admin = new (await import("/js/admin.js")).AdminInterface(this.websocket);
            }
            if (e.key === "Shift") {
                this.shift = true;  // :3
                z("#voteskip", { text: "/downvote/" });
            }
        });

        // Handle shift clicking voteskip
        document.addEventListener("keyup", (e) => {
            if (e.key === "Shift") {
                this.shift = false;
                z("#voteskip", { text: this.voted ? "/voted/" : "/voteskip/" });
            }
        });
    }

    sync_position() {
        this.position_requested = performance.now();
        this.websocket.send(JSON.stringify({ type: "position" }));
    }

    connect() {
        this.websocket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/stream`);
        this.websocket.addEventListener("open", async () => {
            this.websocket.addEventListener("message", (e) => {
                const data = JSON.parse(e.data);
                this.receive(data);
            });

            // Refetch tracklist
            this.tracklist = await (await fetch("/tracklist")).json();
        });
        this.websocket.addEventListener("close", () => {
            z("#voteskip", { class: "red", text: "Connection lost" });
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
        z("progress",  { value: this.audio.time, max: length });
        z("#progress", { text: `${this.seconds(Math.round(this.audio.time))} / ${this.seconds(Math.round(length))}` });
    }

    receive(payload) {
        const { type, data } = payload;
        switch (type) {
            case "position":
                this.audio.set_elapsed((data.elapsed + ((performance.now() - this.position_requested) / 2)));
                break;

            case "update":
                const { user_count, vote_count, vote_ratio } = data;
                if (!vote_count) this.voted = false;
                z("#listeners", { text: `(${user_count} listening along)` });
                z("#voted",     { text: `(${vote_count} / ${Math.ceil(user_count * (vote_ratio / 100))} voted)` });
                z("#voteskip",  { text:  this.voted ? "/voted/" : "/voteskip/", class: "" });

                const { length, path, title } = data.this_track;
                if (path === this.audio.path) return console.warn(`[Radio] Received an update request, but no song change was processed (skip, vote, client change).`);

                this.audio.set_url(path);
                this.audio.preload_url(data.next_track);
                this.sync_position();

                z("#download",  { href: `/audio/${path}` });
                z("#song-name", { text: title });

                // Update UI
                if (this.interval) clearInterval(this.interval);
                this.update_progress(length);
                this.interval = setInterval(() => this.update_progress(length), 100);
                break;
        }
    }
});
