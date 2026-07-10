// telemetry.gs — Google Apps Script Web App bound to a Sheet.
// Deploy: Extensions > Apps Script > paste this > Deploy > New deployment
//   > type Web app > Execute as: Me > Who has access: Anyone > copy /exec.
// See docs/telemetry-setup.md. Column order MUST match the client payload.

var SHEET = "runs";
var HEADERS = ["ts", "handle", "runId", "gameVersion", "outcome",
  "finalWaveIndex", "finalWaveName", "deaths", "kills", "timeSec",
  "sudsEarned", "wavesReached", "deathsByWave", "benedictions", "items"];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(HEADERS); }
  return sh;
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    sheet_().appendRow([
      new Date(), d.handle || "", d.runId || "", d.gameVersion || "", d.outcome || "",
      d.finalWaveIndex, d.finalWaveName || "", d.deaths || 0, d.kills || 0,
      d.timeSec || 0, d.sudsEarned || 0,
      JSON.stringify(d.wavesReached || []), JSON.stringify(d.deathsByWave || {}),
      JSON.stringify(d.benedictions || []), JSON.stringify(d.items || [])
    ]);
  } catch (err) { /* drop malformed */ }
  return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  var cb = (e && e.parameter && e.parameter.cb) ? e.parameter.cb : "";
  var top = [];
  try {
    var rows = sheet_().getDataRange().getValues();
    var idx = {}; HEADERS.forEach(function (h, i) { idx[h] = i; });
    var wins = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (r[idx.outcome] === "win") {
        wins.push({ handle: r[idx.handle], timeSec: Number(r[idx.timeSec]), deaths: Number(r[idx.deaths]) });
      }
    }
    wins.sort(function (a, b) { return a.timeSec - b.timeSec; });
    top = wins.slice(0, 10);
  } catch (err) { /* empty board on error */ }
  var json = JSON.stringify(top);
  var out = cb ? (cb + "(" + json + ")") : json;
  return ContentService.createTextOutput(out)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

// Spreadsheet menu: Telemetry > Rebuild matrix — per-wave reached/deaths/rate.
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Telemetry")
    .addItem("Rebuild matrix", "buildMatrix").addToUI();
}

function buildMatrix() {
  var rows = sheet_().getDataRange().getValues();
  var idx = {}; HEADERS.forEach(function (h, i) { idx[h] = i; });
  var reached = {}, deaths = {}, maxW = 0;
  for (var i = 1; i < rows.length; i++) {
    var wr = [], db = {};
    try { wr = JSON.parse(rows[i][idx.wavesReached] || "[]"); } catch (e) {}
    try { db = JSON.parse(rows[i][idx.deathsByWave] || "{}"); } catch (e) {}
    wr.forEach(function (w) { reached[w] = (reached[w] || 0) + 1; maxW = Math.max(maxW, Number(w)); });
    for (var k in db) { deaths[k] = (deaths[k] || 0) + Number(db[k]); maxW = Math.max(maxW, Number(k)); }
  }
  var out = [["wave", "reached", "deaths", "deathRate"]];
  for (var w = 0; w <= maxW; w++) {
    var rc = reached[w] || 0, dc = deaths[w] || 0;
    out.push([w, rc, dc, rc ? dc / rc : 0]);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var m = ss.getSheetByName("matrix"); if (!m) m = ss.insertSheet("matrix"); else m.clear();
  m.getRange(1, 1, out.length, 4).setValues(out);
}
