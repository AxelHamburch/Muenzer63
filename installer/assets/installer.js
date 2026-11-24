// Muenzer63 web installer – serial configuration logic (based on the FOSSA web installer).
// Protocol (firmware: src/main.cpp, executeConfig), 115200 baud, newline terminated:
//   /config                       enter config mode (only accepted shortly after boot)
//   /ping                         -> "/pong <firmware version>" (config mode only)
//   /file-remove <file>           delete file
//   /file-append <file> <data>    append <data> + newline -> "appendToFile: <file>"
//   /file-read <file>             -> "/file-read <line>" ... "/file-done"
//   /config-done                  leave config mode, device restarts

const CONFIG_FILE = "config.json";
const BAUD_RATE = 115200;

// Fields in the form == "name" entries in the config file on the device.
const FIELDS = ["config_lnurl"];

const serial = new Serial();
const $ = (id) => document.getElementById(id);

let configMode = false;
let busy = false;
let lineListeners = [];

// ───────────────────────── helpers ─────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(text) {
  const el = $("console");
  el.textContent += text + "\n";
  el.scrollTop = el.scrollHeight;
}

function showMessage(type, text) {
  const el = $("message");
  el.className = type; // "ok" | "err" | ""
  el.textContent = text || "";
}

function setPill(id, state, text) {
  const el = $(id);
  el.className = "pill" + (state ? " " + state : "");
  el.textContent = text;
}

function updateUi() {
  const connected = !!(serial.serialPort && serial.isOpen());
  setPill("connection-status", connected ? "ok" : "", connected ? "✅ Connected" : "❌ Not connected");
  setPill("config-mode-status", configMode ? "ok" : "", configMode ? "✅ Config mode" : "❌ No config mode");
  $("connect-button").disabled = connected || busy;
  $("disconnect-button").disabled = !connected;
  $("restart-button").disabled = !connected || busy;
  $("read-button").disabled = !(connected && configMode) || busy;
  $("write-button").disabled = !(connected && configMode) || busy;
  $("finish-button").disabled = !(connected && configMode) || busy;
}

// Wait for a received line matching predicate(line); resolves with the line or null on timeout.
function waitForLine(predicate, timeoutMs) {
  return new Promise((resolve) => {
    const entry = { predicate, resolve: null };
    const timer = setTimeout(() => {
      lineListeners = lineListeners.filter((l) => l !== entry);
      resolve(null);
    }, timeoutMs);
    entry.resolve = (line) => {
      clearTimeout(timer);
      lineListeners = lineListeners.filter((l) => l !== entry);
      resolve(line);
    };
    lineListeners.push(entry);
  });
}

// Send text in small pieces so the device never has to buffer a long line at once.
async function sendLine(text) {
  const data = text + "\n";
  for (let i = 0; i < data.length; i += 48) {
    await serial.write(data.slice(i, i + 48));
    await sleep(15);
  }
}

// ───────────────────────── serial events ─────────────────────────

serial.on(SerialEvents.CONNECTION_OPENED, () => {
  log("[port opened]");
  updateUi();
});

serial.on(SerialEvents.CONNECTION_CLOSED, () => {
  log("[port closed]");
  configMode = false;
  $("firmware-info").textContent = "";
  updateUi();
});

serial.on(SerialEvents.ERROR_OCCURRED, (_s, error) => {
  const msg = error && error.message ? error.message : String(error);
  log("[error] " + msg);
  if (!/No port selected/i.test(msg)) showMessage("err", "Serial error: " + msg);
  updateUi();
});

serial.on(SerialEvents.DATA_RECEIVED, (_s, line) => {
  const text = line.replace(/\r/g, "");
  if (text === "") return;
  log(text);
  for (const l of [...lineListeners]) {
    if (l.predicate(text)) l.resolve(text);
  }
});

// ───────────────────────── config mode ─────────────────────────

// Repeatedly asks the device to enter config mode until it answers /ping.
async function enterConfigMode(timeoutMs) {
  configMode = false;
  updateUi();
  const start = Date.now();
  while (Date.now() - start < timeoutMs && serial.isOpen()) {
    const pong = waitForLine((l) => l.startsWith("/pong"), 450);
    try {
      await serial.write("/config\n");
      await sleep(80);
      await serial.write("/ping\n");
    } catch (e) {
      break;
    }
    const line = await pong;
    if (line) {
      configMode = true;
      const version = line.split(" ")[1];
      $("firmware-info").textContent = version ? "Firmware: " + version : "";
      updateUi();
      return true;
    }
  }
  updateUi();
  return false;
}

async function connectAndEnterConfig(afterReset) {
  busy = true;
  updateUi();
  showMessage("", "");
  try {
    if (afterReset) await serial.hardwareReset();
    showMessage("", "Waiting for the device… (starting config mode)");
    const ok = await enterConfigMode(11000);
    if (ok) {
      showMessage("ok", "Device is in config mode.");
      await readConfig(true);
    } else {
      showMessage(
        "err",
        "No answer from the device. Press “Restart device”, or hold the LED button while switching the Muenzer63 on. " +
          "Make sure the ESP32 runs the web-installer firmware (step 1)."
      );
    }
  } catch (e) {
    log("[error] " + e.message);
    showMessage("err", "Error: " + e.message);
  } finally {
    busy = false;
    updateUi();
  }
}

// ───────────────────────── form <-> config ─────────────────────────

function readForm() {
  const values = {};
  for (const name of FIELDS) values[name] = $(name).value.trim();
  return values;
}

function fillForm(entries) {
  let count = 0;
  for (const e of entries) {
    if (e && FIELDS.includes(e.name) && e.value !== undefined && e.value !== null) {
      $(e.name).value = String(e.value);
      count++;
    }
  }
  return count;
}

function setError(name, text) {
  const err = document.querySelector(`[data-error-for="${name}"]`);
  if (err) err.textContent = text || "";
  $(name).classList.toggle("invalid", !!text);
}

function validate(values) {
  const errors = {};

  if (!values.config_lnurl) {
    errors.config_lnurl = "Required.";
  } else if (!/^https?:\/\/[^,\s"]+\/api\/[^,\s"]*,[^,\s"]+,[A-Za-z]{2,}$/.test(values.config_lnurl)) {
    errors.config_lnurl = "Expected format: https://host/…/api/…/XXXXX,secret,CURRENCY";
  }

  for (const name of FIELDS) setError(name, errors[name]);
  return Object.keys(errors).length === 0;
}

function toConfigJson(values) {
  // Same format the original LNbits hardware installer wrote: array of {name, value}
  return JSON.stringify(FIELDS.map((name) => ({ name, value: values[name] })));
}

// ───────────────────────── device read / write ─────────────────────────

// Returns the parsed config array, [] if no file / empty, or null on timeout/parse error.
async function fetchConfig() {
  const lines = [];
  const collector = (l) => l.startsWith("/file-read ");
  const done = waitForLine((l) => l === "/file-done", 4000);
  // dedicated listener that collects the file lines
  const entry = { predicate: (l) => { if (collector(l)) lines.push(l.slice("/file-read ".length)); return false; }, resolve: () => {} };
  lineListeners.push(entry);
  await sendLine("/file-read " + CONFIG_FILE);
  const finished = await done;
  lineListeners = lineListeners.filter((l) => l !== entry);
  if (!finished) return null;
  const text = lines.join("").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    log("[parse error] " + e.message);
    return null;
  }
}

async function readConfig(silent) {
  const entries = await fetchConfig();
  if (entries === null) {
    showMessage("err", "Could not read the configuration from the device.");
    return;
  }
  if (entries.length === 0) {
    if (!silent) showMessage("", "No device string stored on the device yet.");
    else showMessage("ok", "Device is in config mode. No device string stored yet – please enter it.");
    return;
  }
  const n = fillForm(entries);
  validate(readForm());
  showMessage("ok", `Device is in config mode. Loaded ${n} stored values from the device.`);
}

async function writeConfig() {
  const values = readForm();
  if (!validate(values)) {
    showMessage("err", "Please fix the highlighted fields.");
    return;
  }
  busy = true;
  updateUi();
  try {
    showMessage("", "Writing configuration…");
    const json = toConfigJson(values);
    await sendLine("/file-remove " + CONFIG_FILE);
    await sleep(300);
    const appended = waitForLine((l) => l.startsWith("appendToFile:"), 4000);
    await sendLine("/file-append " + CONFIG_FILE + " " + json);
    if (!(await appended)) throw new Error("Device did not confirm the write.");
    await sleep(300);

    // Verify by reading back
    const stored = await fetchConfig();
    if (stored === null) throw new Error("Written, but read-back failed.");
    const map = Object.fromEntries(stored.map((e) => [e.name, String(e.value)]));
    const bad = FIELDS.filter((n) => map[n] !== values[n]);
    if (bad.length) throw new Error("Verification failed for: " + bad.join(", "));
    showMessage("ok", "Configuration written and verified ✔. Press “Finish & restart” to apply it.");
  } catch (e) {
    log("[error] " + e.message);
    showMessage("err", e.message);
  } finally {
    busy = false;
    updateUi();
  }
}

async function finish() {
  busy = true;
  updateUi();
  try {
    await sendLine("/config-done");
    await waitForLine((l) => l.startsWith("/config-done"), 2000);
    configMode = false;
    showMessage("ok", "Device is restarting with the new configuration. You can disconnect now.");
  } catch (e) {
    showMessage("err", e.message);
  } finally {
    busy = false;
    updateUi();
  }
}

// ───────────────────────── wiring ─────────────────────────

$("connect-button").addEventListener("click", async () => {
  if (!navigator.serial) {
    showMessage("err", "Web Serial is not supported by this browser. Use Google Chrome or Microsoft Edge.");
    return;
  }
  showMessage("", "");
  await serial.connectAndOpen(null, { baudRate: BAUD_RATE });
  if (serial.serialPort) {
    await sleep(300);
    if (serial.isOpen()) await connectAndEnterConfig(false);
  }
});

$("restart-button").addEventListener("click", () => connectAndEnterConfig(true));

$("disconnect-button").addEventListener("click", async () => {
  try {
    await serial.close();
  } catch (e) {
    log("[error] " + e.message);
  }
  showMessage("", "");
  updateUi();
});

$("read-button").addEventListener("click", async () => {
  busy = true;
  updateUi();
  await readConfig(false);
  busy = false;
  updateUi();
});
$("write-button").addEventListener("click", writeConfig);
$("finish-button").addEventListener("click", finish);

for (const name of FIELDS) {
  $(name).addEventListener("input", () => setError(name, ""));
}

// Flash button: release the serial port first, the flash dialog needs it.
$("flash-button").addEventListener(
  "click",
  async () => {
    if (serial.serialPort) {
      try {
        await serial.close();
      } catch (e) {
        /* ignore */
      }
    }
  },
  true
);

// Cache-busting for manifest + firmware files
function nocacheManifest(url) {
  return url.split("?")[0] + "?_t=" + Date.now();
}
(function () {
  const btn = $("flash-button");
  const sel = $("firmware-version");
  btn.setAttribute("manifest", nocacheManifest(sel.value));
  sel.addEventListener("change", (e) => btn.setAttribute("manifest", nocacheManifest(e.target.value)));
})();

if (!navigator.serial) {
  showMessage("err", "Web Serial is not supported by this browser. Use Google Chrome or Microsoft Edge on a desktop computer.");
}
updateUi();
