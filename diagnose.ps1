# ===== AscendOS Testdiagnose =====
# Nur Diagnose. Aendert nichts. Keine Parameter, die Rechte brauchen.

$db = docker ps --filter "name=supabase_db" --format "{{.Names}}" | Select-Object -First 1
if (-not $db) { Write-Host "FEHLER: kein Supabase-DB-Container laeuft. Zuerst: supabase start"; exit 1 }

$out = "testfehler.txt"
"AscendOS Testdiagnose  $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Out-File $out -Encoding utf8
"Container: $db"                                                | Out-File $out -Append -Encoding utf8
"psql-Exitcodes: 0=durchgelaufen  1=fatal  2=Verbindung  3=SQL-Fehler bei ON_ERROR_STOP" |
  Out-File $out -Append -Encoding utf8

foreach ($f in @("daily_plan","function_security","journey","phases","regression","rls")) {
  ""                                           | Out-File $out -Append -Encoding utf8
  "=================== $f ===================" | Out-File $out -Append -Encoding utf8

  docker cp "supabase\tests\database\$f.test.sql" "${db}:/tmp/t.sql" | Out-Null

  $raw  = docker exec $db psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/t.sql 2>&1
  $code = $LASTEXITCODE          # sofort sichern, bevor etwas anderes es ueberschreibt

  "psql-Exitcode: $code"         | Out-File $out -Append -Encoding utf8

  $sqlErr = $raw | Select-String -Pattern "^psql:|ERROR|FEHLER|CONTEXT|KONTEXT|DETAIL|HINT|TIP|LINE|ZEILE|STATEMENT|ANWEISUNG"
  $tapErr = $raw | Select-String -Pattern "^not ok"

  if ($sqlErr) {
    "--- FALL 1: SQL-Exception ---"                        | Out-File $out -Append -Encoding utf8
    $sqlErr | Select-Object -First 12                      | Out-File $out -Append -Encoding utf8
  }
  else {
    "Keine SQL-Exception gefunden"                         | Out-File $out -Append -Encoding utf8
    if ($tapErr) {
      "--- FALL 2: pgTAP-Testfehler ohne SQL-Exception ---" | Out-File $out -Append -Encoding utf8
      $tapErr | Select-Object -First 12                    | Out-File $out -Append -Encoding utf8
    } else {
      "--- FALL 3: kein not-ok, keine Exception ---"        | Out-File $out -Append -Encoding utf8
    }
    "--- letzte 30 Zeilen der Rohausgabe ---"              | Out-File $out -Append -Encoding utf8
    $raw | Select-Object -Last 30                          | Out-File $out -Append -Encoding utf8
  }

  "not-ok-Zeilen insgesamt: $(@($tapErr).Count)"           | Out-File $out -Append -Encoding utf8
}

# Zuordnungshilfe: Zeilennummern der von mir geaenderten Stellen
""                                                          | Out-File $out -Append -Encoding utf8
"=================== lives_ok-Stellen ===================" | Out-File $out -Append -Encoding utf8
Select-String -Path "supabase\tests\database\*.test.sql" -Pattern "lives_ok" |
  ForEach-Object { "{0}:{1}" -f (Split-Path $_.Path -Leaf), $_.LineNumber } |
  Out-File $out -Append -Encoding utf8

notepad $out