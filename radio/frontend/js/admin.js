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
                #admin input {
                    background: none;
                    border: 1px solid gray;
                    padding-left: 5px;
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
                <span id = "force-play">Force Play</span>
                <div class = "divider"></div>
                <span id = "force-skip">Force Skip</span>
                <div class = "divider"></div>
                <span id = "reindex">Reindex</span>
            </div>
        `;
        document.querySelector("body").appendChild(this.interface);

        // Bind to buttons
        document.querySelector("#force-play").addEventListener("click", () => {
            this.ws.send(JSON.stringify({
                type: "admin",
                data: { command: "force-play", file: prompt("File path:") }
            }));
        });

        document.querySelector("#force-skip").addEventListener("click", () => {
            this.ws.send(JSON.stringify({ type: "admin", data: { command: "force-skip" } }));
        });

        const reindex = document.querySelector("#reindex");
        reindex.addEventListener("click", (e) => {
            this.ws.send(JSON.stringify({ type: "admin", data: { command: "reindex" } }));
            reindex.innerText = "Indexing...";
            this.resolve = () => { reindex.innerText = "Reindex"; };
        });

        document.querySelector("#ratio").addEventListener("change", (e) => {
            this.ws.send(JSON.stringify({
                type: "admin",
                data: { command: "set-ratio", ratio: +e.currentTarget.value }
            }));
        });
    }

    toggle() {
        if (!this.interface) return this.authorize();
        this.interface.classList.toggle("hidden");
    }
};
