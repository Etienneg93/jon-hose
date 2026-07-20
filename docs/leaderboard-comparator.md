# Leaderboard comparator (Apps Script side)

The client now submits `wavesCleared` (int) and `gameVersion` (string) with
every run. The deployed Apps Script's leaderboard read must sort with:

    function semverCmp(a, b) {
      var pa = String(a || "0").split(".").map(Number), pb = String(b || "0").split(".").map(Number);
      for (var i = 0; i < 3; i++) { var d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
      return 0;
    }
    rows.sort(function (a, b) {
      var v = semverCmp(b.gameVersion, a.gameVersion);   // newer version first
      if (v) return v;
      var w = (b.wavesCleared || 0) - (a.wavesCleared || 0);  // waves desc
      if (w) return w;
      return (a.timeSec != null ? a.timeSec : 1e9) - (b.timeSec != null ? b.timeSec : 1e9);  // time asc
    });

Mirrors `JH.Balance.lbCompare` (js/balance.js), which is the unit-tested
source of truth. Old rows without `wavesCleared` sort as 0 waves — they age
out under version priority anyway.

Release checklist: redeploy the Apps Script with this comparator BEFORE
shipping the 36-wave build — the client sort is defense-in-depth, not a
substitute (the server may truncate rows before the client sees them).
