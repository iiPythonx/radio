export class AdminInterface {
    constructor(ws) {
        this.connect(ws);
        this.authorize();
    }

    connect(ws) {
        if (this.password) {
            ws.addEventListener("open", () => {
                ws.send(JSON.stringify({
                    type: "admin",
                    data: {
                        command: "connect",
                        password: this.password
                    }
                }));
            })
        }
        ws.addEventListener("message", (e) => {
            const { type, data } = JSON.parse(e.data);
            if (type !== "admin") return;
            if (data.message) return alert(data.message);
            if (this.resolve) {
                this.resolve(data);
                delete this.resolve;
            }
        });
        this.ws = ws;
    }

    async authorize() {
        this.password = prompt("Admin password:") || null;
        const { success, vote_ratio } = await new Promise((resolve) => {
            this.resolve = resolve;
            this.ws.send(JSON.stringify({
                type: "admin",
                data: {
                    command: "connect",
                    password: this.password
                }
            }));
        });
        if (!success) return alert("Invalid admin key entered.");
        this.initialize(vote_ratio);
    }

    initialize(vote_ratio) {
        this.interface = document.createElement("main");
        this.interface.id = "admin";
        this.interface.innerHTML = `
            <style>
                #admin > div {
                    gap: 10px;
                    margin-bottom: 0px;
                    justify-content: space-between;
                }
                #admin * {
                    font-family: monospace;
                }
                input:not([type = "range"]) {
                    background: none;
                    border: none;
                    outline: none;
                    border-bottom: 1px solid gray;
                }
                .hidden { display: none; }
                .divider {
                    border-left: 1px solid gray;
                    height: 100%;
                    margin-left: 10px;
                    margin-right: 10px;
                }
            </style>
            <div>
                <span>Skip ratio</span>
                <div>
                    <input style = "width: 40px;" type = "number" min = "0" max = "100" value = "${vote_ratio}" id = "ratio">
                    <span>%</span>
                </div>
                <div class = "divider"></div>
                <input style = "flex: 1;" placeholder = "/mnt/music/path/to/file.mp3" id = "file">
                <button id = "force-play">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393"/>
                    </svg>
                </button>
                <div class = "divider"></div>
                <button id = "force-skip">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M12.5 4a.5.5 0 0 0-1 0v3.248L5.233 3.612C4.693 3.3 4 3.678 4 4.308v7.384c0 .63.692 1.01 1.233.697L11.5 8.753V12a.5.5 0 0 0 1 0z"/>
                    </svg>
                </button>
            </div>
        `;
        document.querySelector("body").appendChild(this.interface);

        // Bind to buttons
        document.querySelector("#force-play").addEventListener("click", () => {
            this.ws.send(JSON.stringify({
                type: "admin",
                data: {
                    command: "force-play",
                    file: document.querySelector("#file").value
                }
            }));
        });
        document.querySelector("#force-skip").addEventListener("click", () => {
            this.ws.send(JSON.stringify({
                type: "admin",
                data: { command: "force-skip" }
            }));
        });
        document.querySelector("#ratio").addEventListener("change", (e) => {
            this.ws.send(JSON.stringify({
                type: "admin",
                data: {
                    command: "set-ratio",
                    ratio: +e.currentTarget.value
                }
            }));
        });
    }

    toggle() {
        if (!this.interface) return this.authorize();
        this.interface.classList.toggle("hidden");
    }
};
