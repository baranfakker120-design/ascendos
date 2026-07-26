# ===== AscendOS: fehlgeschlagene Zusicherungen anzeigen =====
# Nur Diagnose. Aendert nichts.

$db = docker ps --filter "name=supabase_db" --format "{{.Names}}" | Select-Object -First 1
if (-not $db) { Write-Host "FEHLER: kein Supabase-DB-Container laeuft."; exit 1 }

$out = "testfehler.txt"
"AscendOS fehlgeschlagene Zusicherungen  $(Get-Date -Format 'yyyy-MM-dd HH:mm')" |
  Out-File $out -Encoding utf8

foreach ($f in @("daily_plan","journey","regression")) {
  ""                                           | Out-File $out -Append -Encoding utf8
  "=================== $f ===================" | Out-File $out -Append -Encoding utf8

  docker cp "supabase\tests\database\$f.test.sql" "${db}:/tmp/t.sql" | Out-Null

  # -X ohne psqlrc, -q leise, -t nur Tupel, -A unformatiert
  # Ohne -t -A umrahmt psql die TAP-Ausgabe und bricht die #-Zeilen um.
  $raw = docker exec $db psql -U postgres -d postgres -X -q -t -A -f /tmp/t.sql 2>&1

  # Volle TAP-Ausgabe sichern, damit nichts verloren geht
  $raw | Out-File "tap_$f.txt" -Encoding utf8

  $fails = $raw | Select-String -Pattern "^not ok" -Context 0,6
  if ($fails) {
    $fails | Out-File $out -Append -Encoding utf8
  } else {
    "Keine not-ok-Zeile gefunden"        | Out-File $out -Append -Encoding utf8
    "--- letzte 30 Zeilen ---"           | Out-File $out -Append -Encoding utf8
    $raw | Select-Object -Last 30        | Out-File $out -Append -Encoding utf8
  }

  "not-ok insgesamt: $(@($raw | Select-String -Pattern '^not ok').Count)" |
    Out-File $out -Append -Encoding utf8
}

notepad $out