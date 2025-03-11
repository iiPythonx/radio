// Copyright (c) 2025 iiPython

(() => {
    const m = { text: "innerText", html: "innerHTML", class: "classList" };
    const i = (element, props) => {
        for (const name in props) {
            const value = props[name];
            if (typeof value === "object") {
                i(element[name], value);
                continue;
            };
            element[m[name] ?? name] = value;
        }
    }
    const f = (target, props) => {
        if (props) i(target, props);
        if (!target[Symbol.for("z")]) {
            for (const name in m) {
                const mapping = m[name];
                Object.defineProperty(target, name, {
                    get() { return target[mapping]; },
                    set(value) { target[mapping] = value; }
                })
            }
            target[Symbol.for("z")] = true;
        }
        return target;
    };
    window.z = (target, props) => f(document.querySelector(target), props);
    window.zs = (target, props) => {
        const result = Array.from(document.querySelectorAll(target)).map(e => f(e, props));
        for (const name in m) {
            Object.defineProperty(result, name, {
                get() { return result.map(e => e[name]); },
                set(value) { for (const obj of result) obj[name] = value; }
            })
        }
        return result;
    };
})();
