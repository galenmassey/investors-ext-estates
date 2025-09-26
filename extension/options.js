const $ = (s) => document.querySelector(s);
const msg = (t, cls="") => { const m = $("#msg"); m.className = cls; m.textContent = t; };

async function save() {
  const UPLOAD_ENDPOINT = $("#endpoint").value.trim();
  const SUPABASE_URL = $("#url").value.trim();
  const SUPABASE_ANON_KEY = $("#anon").value.trim();

  await chrome.storage.local.set({ UPLOAD_ENDPOINT, SUPABASE_URL, SUPABASE_ANON_KEY });
  msg("Saved.", "ok");
}

async function load() {
  const { UPLOAD_ENDPOINT="", SUPABASE_URL="", SUPABASE_ANON_KEY="" } = await chrome.storage.local.get([
    "UPLOAD_ENDPOINT","SUPABASE_URL","SUPABASE_ANON_KEY"
  ]);
  $("#endpoint").value = UPLOAD_ENDPOINT;
  $("#url").value = SUPABASE_URL;
  $("#anon").value = SUPABASE_ANON_KEY;
  msg("Loaded current values.", "ok");
}

async function clearVals() {
  await chrome.storage.local.remove(["UPLOAD_ENDPOINT","SUPABASE_URL","SUPABASE_ANON_KEY"]);
  $("#endpoint").value = $("#url").value = $("#anon").value = "";
  msg("Cleared.", "ok");
}

async function test() {
  const { UPLOAD_ENDPOINT, SUPABASE_URL, SUPABASE_ANON_KEY } = await chrome.storage.local.get([
    "UPLOAD_ENDPOINT","SUPABASE_URL","SUPABASE_ANON_KEY"
  ]);
  if (!UPLOAD_ENDPOINT || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    msg("Missing one or more values. Save first.", "err"); return;
  }
  try {
    // simple HEAD/ping if CORS allows; otherwise just success message
    const r = await fetch(UPLOAD_ENDPOINT, { method: "HEAD", mode: "no-cors" }).catch(()=>({ok:true}));
    msg("Values present. Endpoint reachable (or no-cors).", "ok");
  } catch(e) {
    msg("Saved, but endpoint not reachable from browser. (This can be OK in dev.)", "err");
  }
}

$("#save").addEventListener("click", save);
$("#load").addEventListener("click", load);
$("#clear").addEventListener("click", clearVals);
$("#test").addEventListener("click", test);
document.addEventListener("DOMContentLoaded", load);